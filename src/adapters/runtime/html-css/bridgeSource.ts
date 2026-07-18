/** Trusted nonce scriptへ埋め込む自己完結Preview Bridge sourceを生成する。 */

export interface BridgeConfig {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly bootstrapToken: string;
  readonly viewport: { readonly id: string; readonly width: number; readonly height: number };
  readonly stylesheetReferences?: readonly BridgeStylesheetReference[];
}

export interface BridgeStylesheetReference {
  readonly attributes: readonly (readonly [name: string, value: string])[];
}

const SAFE_CONFIG_VALUE = /^[a-z0-9._:-]+$/iu;
const SAFE_TOKEN = /^[a-z0-9_-]+$/iu;

/** Bridgeへ埋め込む識別子・Token・viewportが有限でcode境界を作らないことを検証する。 */
export function assertBridgeConfig(config: BridgeConfig): void {
  const stylesheetReferences = config.stylesheetReferences ?? [];
  const validStylesheetReferences =
    stylesheetReferences.length <= 64 &&
    stylesheetReferences.every(({ attributes }) => {
      const names = new Set<string>();
      return (
        attributes.length <= 64 &&
        attributes.every(([name, value]) => {
          const normalizedName = name.toLowerCase();
          const valid =
            /^[a-z][a-z\d:-]*$/u.test(name) &&
            name === normalizedName &&
            name.length <= 256 &&
            value.length <= 1_000 &&
            normalizedName !== 'nonce' &&
            !normalizedName.startsWith('on') &&
            !normalizedName.startsWith('data-tsumucode-') &&
            !names.has(normalizedName);
          names.add(normalizedName);
          return valid;
        })
      );
    });
  if (
    !SAFE_CONFIG_VALUE.test(config.exerciseSessionId) ||
    config.exerciseSessionId.length > 256 ||
    !Number.isInteger(config.executionRevision) ||
    config.executionRevision < 0 ||
    !SAFE_TOKEN.test(config.bootstrapToken) ||
    config.bootstrapToken.length > 512 ||
    !SAFE_CONFIG_VALUE.test(config.viewport.id) ||
    config.viewport.id.length > 256 ||
    !Number.isFinite(config.viewport.width) ||
    config.viewport.width <= 0 ||
    !Number.isFinite(config.viewport.height) ||
    config.viewport.height <= 0 ||
    !validStylesheetReferences
  ) {
    throw new Error('Invalid preview configuration');
  }
}

/** iframe内だけで実行され、Snapshot requestを検証してbounded dataを親へ返す。 */
function bridgeRuntime(config: BridgeConfig): void {
  const version = 1;
  const maxSelectors = 64;
  const maxAttributes = 64;
  const maxComputedStyles = 128;
  const maxNodes = 5_000;
  const maxTextLength = 100_000;
  const maxSnapshotCharacters = 2_000_000;
  const maxRequests = 1_024;
  const parentWindow = window.parent;
  const usedRequestIds = new Set<string>();
  const usedTokens = new Set<string>();
  const observableDocument = document.implementation.createHTMLDocument('');
  observableDocument.head.replaceChildren();
  for (const reference of config.stylesheetReferences ?? []) {
    const link = observableDocument.createElement('link');
    for (const [name, value] of reference.attributes) link.setAttribute(name, value);
    observableDocument.head.append(link);
  }

  const send = (
    type: 'bridge.ready' | 'bridge.error' | 'snapshot.response',
    requestId: string,
    oneTimeToken: string,
    payload: unknown,
  ): void => {
    parentWindow.postMessage(
      {
        version,
        type,
        exerciseSessionId: config.exerciseSessionId,
        requestId,
        oneTimeToken,
        payload,
      },
      '*',
    );
  };

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  };

  const boundedStringArray = (value: unknown, maximum: number): value is string[] =>
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 1_000) &&
    new Set(value).size === value.length;

  const parsePolicy = (value: Record<string, unknown>) => {
    const selectors = value.selectors;
    const attributes = value.attributes;
    const computedStyles = value.computedStyles;
    const includeAllElements = value.includeAllElements;
    if (
      !hasExactKeys(value, ['selectors', 'attributes', 'computedStyles', 'includeAllElements']) ||
      !boundedStringArray(selectors, maxSelectors) ||
      !boundedStringArray(attributes, maxAttributes) ||
      !boundedStringArray(computedStyles, maxComputedStyles) ||
      typeof includeAllElements !== 'boolean'
    ) {
      throw new Error('Snapshot policy schema error');
    }
    return { selectors, attributes, computedStyles, includeAllElements };
  };

  const finite = (value: number): number => {
    if (!Number.isFinite(value)) throw new Error('Snapshot contains a non-finite number');
    return value;
  };

  const nonNegative = (value: number): number => {
    const result = finite(value);
    if (result < 0) throw new Error('Snapshot contains a negative size');
    return result;
  };

  const normalizeText = (value: string): string => {
    const normalized = value.replace(/\s+/gu, ' ').trim();
    if (normalized.length > maxTextLength) throw new Error('Snapshot text limit exceeded');
    return normalized;
  };

  const implicitRole = (element: Element): string => {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/u.test(tag)) return 'heading';
    if (tag === 'a') return element.hasAttribute('href') ? 'link' : '';
    const roles: Readonly<Record<string, string>> = {
      article: 'article',
      aside: 'complementary',
      button: 'button',
      form: 'form',
      img: 'img',
      li: 'listitem',
      main: 'main',
      nav: 'navigation',
      ol: 'list',
      progress: 'progressbar',
      table: 'table',
      tbody: 'rowgroup',
      td: 'cell',
      textarea: 'textbox',
      tfoot: 'rowgroup',
      th: 'columnheader',
      thead: 'rowgroup',
      tr: 'row',
      ul: 'list',
    };
    return roles[tag] ?? '';
  };

  const isFocusable = (
    element: Element,
    style: Pick<CSSStyleDeclaration, 'display' | 'visibility'>,
  ): boolean => {
    const html = element as HTMLElement;
    if (
      html.hasAttribute('disabled') ||
      element.matches(':disabled') ||
      element.closest('[hidden], [aria-hidden="true"]') !== null ||
      style.display === 'none' ||
      style.visibility === 'hidden'
    ) {
      return false;
    }
    if (html.tabIndex >= 0) return true;
    const tag = element.tagName.toLowerCase();
    if (tag === 'a') return element.hasAttribute('href');
    if (tag === 'input' && (element as HTMLInputElement).type === 'hidden') return false;
    return ['button', 'input', 'select', 'textarea'].includes(tag);
  };

  const accessibleName = (element: Element): string => {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel !== null) return normalizeText(ariaLabel);
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy !== null) {
      const label = labelledBy
        .split(/\s+/u)
        .filter(Boolean)
        .map((id) => document.getElementById(id))
        .filter((node): node is HTMLElement => node !== null && document.body.contains(node))
        .map((node) => node.textContent)
        .join(' ')
        .trim();
      if (label.length > 0) return normalizeText(label);
    }
    if (element instanceof HTMLImageElement) return normalizeText(element.alt);
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const labels = Array.from(element.labels ?? [])
        .map((label) => label.textContent)
        .join(' ');
      if (labels.length > 0) return normalizeText(labels);
    }
    const role = element.getAttribute('role')?.trim().toLowerCase() || implicitRole(element);
    if (
      [
        'banner',
        'complementary',
        'contentinfo',
        'form',
        'main',
        'navigation',
        'region',
        'search',
      ].includes(role)
    ) {
      return '';
    }
    return normalizeText(element.textContent);
  };

  const overflow = (element: HTMLElement) => ({
    x: element.scrollWidth > element.clientWidth,
    y: element.scrollHeight > element.clientHeight,
    scrollWidth: nonNegative(element.scrollWidth),
    scrollHeight: nonNegative(element.scrollHeight),
    clientWidth: nonNegative(element.clientWidth),
    clientHeight: nonNegative(element.clientHeight),
  });

  const closestAnchor = (target: EventTarget | null): Element | null => {
    if (target instanceof Element) return target.closest('a');
    if (target instanceof Node) return target.parentElement?.closest('a') ?? null;
    return null;
  };

  const preventAnchorNavigation = (event: Event): void => {
    if (closestAnchor(event.target) !== null) event.preventDefault();
  };

  document.addEventListener('click', preventAnchorNavigation, true);
  document.addEventListener('auxclick', preventAnchorNavigation, true);
  document.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
    },
    true,
  );

  /** Learner由来で実行能力のないhead情報だけをSnapshot観測へ許可する。 */
  const isObservableHeadElement = (element: Element): boolean => {
    const tag = element.tagName.toLowerCase();
    return (
      tag === 'title' ||
      (tag === 'link' &&
        element.getAttribute('rel')?.trim().toLowerCase() === 'stylesheet' &&
        element.hasAttribute('href')) ||
      (tag === 'meta' &&
        (element.hasAttribute('charset') ||
          element.getAttribute('name')?.trim().toLowerCase() === 'viewport'))
    );
  };

  window.addEventListener('message', (event) => {
    if (event.source !== parentWindow || !isRecord(event.data)) return;
    const message = event.data;
    if (
      !hasExactKeys(message, [
        'version',
        'type',
        'exerciseSessionId',
        'executionRevision',
        'requestId',
        'oneTimeToken',
        'payload',
      ]) ||
      message.version !== version ||
      message.type !== 'snapshot.request' ||
      message.exerciseSessionId !== config.exerciseSessionId ||
      message.executionRevision !== config.executionRevision ||
      typeof message.requestId !== 'string' ||
      message.requestId.length === 0 ||
      message.requestId.length > 256 ||
      typeof message.oneTimeToken !== 'string' ||
      message.oneTimeToken.length === 0 ||
      message.oneTimeToken.length > 512 ||
      !isRecord(message.payload)
    ) {
      return;
    }
    if (usedRequestIds.has(message.requestId) || usedTokens.has(message.oneTimeToken)) return;
    usedRequestIds.add(message.requestId);
    usedTokens.add(message.oneTimeToken);

    try {
      if (usedRequestIds.size > maxRequests) throw new Error('Snapshot request limit exceeded');
      const policy = parsePolicy(message.payload);

      const selected = new Set<Element>();
      if (policy.includeAllElements) {
        selected.add(document.documentElement);
        selected.add(document.body);
        document.body.querySelectorAll('*').forEach((node) => selected.add(node));
      }
      for (const selector of policy.selectors) {
        if (document.documentElement.matches(selector)) selected.add(document.documentElement);
        if (document.body.matches(selector)) selected.add(document.body);
        document.head.querySelectorAll(selector).forEach((node) => {
          if (isObservableHeadElement(node)) selected.add(node);
        });
        observableDocument.head.querySelectorAll(selector).forEach((node) => {
          if (isObservableHeadElement(node)) selected.add(node);
        });
        document.body.querySelectorAll(selector).forEach((node) => selected.add(node));
      }
      for (const element of [...selected]) {
        let ancestor = element.parentElement;
        while (ancestor !== null) {
          selected.add(ancestor);
          if (ancestor === document.documentElement) break;
          ancestor = ancestor.parentElement;
        }
      }
      if (selected.size > maxNodes) throw new Error('Snapshot node limit exceeded');

      let remainingCharacters = maxSnapshotCharacters;
      const outputString = (value: string, label: string, maximum = maxTextLength): string => {
        if (value.length > maximum) throw new Error(`Snapshot ${label} limit exceeded`);
        remainingCharacters -= value.length;
        if (remainingCharacters < 0) throw new Error('Snapshot total text limit exceeded');
        return value;
      };

      const elements = [...selected].sort((left, right) => {
        if (left === right) return 0;
        if (left.ownerDocument !== right.ownerDocument) {
          return left.ownerDocument === observableDocument ? -1 : 1;
        }
        return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
      const ids = new Map(elements.map((element, index) => [element, index + 1]));
      const nodes = elements.map((element, index) => {
        const isDocumentElement = element === document.documentElement;
        const isObservableReference = element.ownerDocument === observableDocument;
        const style = isObservableReference
          ? ({
              display: '',
              visibility: '',
              getPropertyValue: () => '',
            } satisfies Pick<CSSStyleDeclaration, 'display' | 'visibility' | 'getPropertyValue'>)
          : getComputedStyle(element);
        const rect = isObservableReference
          ? { x: 0, y: 0, width: 0, height: 0 }
          : element.getBoundingClientRect();
        const html = element as HTMLElement;
        const attributes = Object.fromEntries(
          policy.attributes.flatMap((name) => {
            if (!element.hasAttribute(name)) return [];
            outputString(name, 'attribute name', 256);
            const value = outputString(element.getAttribute(name) ?? '', 'attribute');
            return [[name, value]];
          }),
        );
        const computedStyles = Object.fromEntries(
          policy.computedStyles.map((name) => {
            outputString(name, 'computed style name', 256);
            const value = outputString(style.getPropertyValue(name), 'computed style');
            return [name, value];
          }),
        );
        const role = outputString(
          element.getAttribute('role') ?? implicitRole(element),
          'role',
          256,
        );
        const matchedSelectors = policy.selectors.filter(
          (selector) =>
            (!isObservableReference || element.tagName.toLowerCase() === 'link') &&
            element.matches(selector),
        );
        matchedSelectors.forEach((selector) => {
          outputString(selector, 'selector', 1_000);
        });
        return {
          nodeId: ids.get(element)!,
          parentId: ids.get(element.parentElement as Element) ?? null,
          documentOrder: index,
          tagName: outputString(element.tagName.toLowerCase(), 'tag name', 64),
          matchedSelectors,
          attributes,
          text: outputString(
            normalizeText(isDocumentElement ? document.body.textContent : element.textContent),
            'text',
          ),
          computedStyles,
          rect: {
            x: finite(rect.x),
            y: finite(rect.y),
            width: nonNegative(rect.width),
            height: nonNegative(rect.height),
          },
          overflow: overflow(html),
          focusable: isFocusable(element, style),
          accessibleName: outputString(
            isDocumentElement ? '' : accessibleName(element),
            'accessible name',
          ),
          role,
        };
      });
      const root = document.documentElement;
      send('snapshot.response', message.requestId, message.oneTimeToken, {
        exerciseSessionId: config.exerciseSessionId,
        executionRevision: config.executionRevision,
        viewport: config.viewport,
        nodes,
        documentOverflow: overflow(root),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      send('bridge.error', message.requestId, message.oneTimeToken, detail.slice(0, 2_000));
    }
  });

  let readySent = false;
  const announceReady = (): void => {
    if (readySent) return;
    readySent = true;
    send('bridge.ready', 'ready', config.bootstrapToken, null);
  };
  const announceAfterLayout = (): void => {
    document.documentElement.getBoundingClientRect();
    setTimeout(announceReady, 0);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announceAfterLayout, { once: true });
  } else {
    announceAfterLayout();
  }
}

/** Trusted functionと検証済みconfigだけからnonce script sourceを作る。 */
export function createBridgeSource(config: BridgeConfig): string {
  assertBridgeConfig(config);
  const serialized = JSON.stringify(config)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
  const source = `(${bridgeRuntime.toString()})(${serialized});`;
  if (/<\/script/iu.test(source)) throw new Error('Invalid preview configuration');
  return source;
}
