/** Trusted nonce scriptへ埋め込む自己完結Preview Bridge sourceを生成する。 */

export interface BridgeConfig {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly bootstrapToken: string;
  readonly viewport: {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly reducedMotion?: 'reduce' | undefined;
  };
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
  const configuredReducedMotion = (config.viewport as { readonly reducedMotion?: unknown })
    .reducedMotion;
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
    (configuredReducedMotion !== undefined && configuredReducedMotion !== 'reduce') ||
    !validStylesheetReferences
  ) {
    throw new Error('Invalid preview configuration');
  }
}

/** iframe内だけで実行され、Snapshot requestを検証してbounded dataを親へ返す。 */
function bridgeRuntime(config: BridgeConfig): void {
  // JavaScript側のlearner取消観測を経由せず、trusted安全取消を実行する。
  // eslint-disable-next-line @typescript-eslint/unbound-method -- native receiverをapplyで明示する。
  const nativePreventDefault = Event.prototype.preventDefault;
  const applyNative = Reflect.apply.bind(Reflect);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 捕捉getterをReflect.applyでnative inputへ適用する。
  const nativeInputValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.get;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 捕捉getterをReflect.applyでnative inputへ適用する。
  const nativeInputType = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type')?.get;
  const NativeInput = HTMLInputElement;
  const nativeComputedStyle = window.getComputedStyle.bind(window);
  const version = 1;
  const maxSelectors = 64;
  const maxAttributes = 64;
  const maxComputedStyles = 128;
  const maxNodes = 5_000;
  const maxTextLength = 100_000;
  const maxSnapshotCharacters = 2_000_000;
  const maxRequests = 1_024;
  const parentWindow = window.parent;
  const scheduleTask = window.setTimeout.bind(window);
  const objectKeys = Object.keys.bind(Object);
  const objectFromEntries = Object.fromEntries.bind(Object);
  const executingScript = document.currentScript;
  if (executingScript instanceof HTMLScriptElement) executingScript.remove();
  const usedRequestIds = new Set<string>();
  const usedTokens = new Set<string>();
  const observableDocument = document.implementation.createHTMLDocument('');
  observableDocument.head.replaceChildren();
  for (const reference of config.stylesheetReferences ?? []) {
    const link = observableDocument.createElement('link');
    for (const [name, value] of reference.attributes) link.setAttribute(name, value);
    observableDocument.head.append(link);
  }

  /** reduce検証用Viewportでは、実Media Query内のRuleだけをtrusted overrideへ展開する。 */
  const applyReducedMotionEmulation = (): void => {
    if (config.viewport.reducedMotion !== 'reduce') return;
    const reducedRules: string[] = [];
    for (const stylesheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try {
        rules = stylesheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of [...rules]) {
        if (!(rule instanceof CSSMediaRule)) continue;
        const normalizedCondition = rule.conditionText.replace(/\s+/gu, '').toLowerCase();
        if (normalizedCondition !== '(prefers-reduced-motion:reduce)') continue;
        reducedRules.push(...[...rule.cssRules].map((nestedRule) => nestedRule.cssText));
      }
    }
    if (reducedRules.length === 0) return;
    const override = document.createElement('style');
    override.setAttribute('data-tsumucode-reduced-motion-emulation', '');
    override.textContent = reducedRules.join('\n');
    document.head.append(override);
  };

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
    const actual = objectKeys(value).sort();
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
    const inputValueSelectors = objectKeys(value).includes('inputValueSelectors')
      ? value.inputValueSelectors
      : [];
    const hoverSelectors = Object.prototype.hasOwnProperty.call(value, 'hoverSelectors')
      ? value.hoverSelectors
      : [];
    const hoverComputedStyles = Object.prototype.hasOwnProperty.call(value, 'hoverComputedStyles')
      ? value.hoverComputedStyles
      : [];
    const attributes = value.attributes;
    const computedStyles = value.computedStyles;
    const focusVisibleSelectors = value.focusVisibleSelectors;
    const focusVisibleComputedStyles = value.focusVisibleComputedStyles;
    const includeAllElements = value.includeAllElements;
    if (
      !hasExactKeys(value, [
        'selectors',
        'attributes',
        'computedStyles',
        'focusVisibleSelectors',
        'focusVisibleComputedStyles',
        'includeAllElements',
        ...(Object.prototype.hasOwnProperty.call(value, 'hoverSelectors')
          ? ['hoverSelectors']
          : []),
        ...(Object.prototype.hasOwnProperty.call(value, 'hoverComputedStyles')
          ? ['hoverComputedStyles']
          : []),
        ...(Object.prototype.hasOwnProperty.call(value, 'inputValueSelectors')
          ? ['inputValueSelectors']
          : []),
      ]) ||
      !boundedStringArray(selectors, maxSelectors) ||
      !boundedStringArray(inputValueSelectors, maxSelectors) ||
      !inputValueSelectors.every((selector) => selectors.includes(selector)) ||
      !boundedStringArray(hoverSelectors, maxSelectors) ||
      !boundedStringArray(hoverComputedStyles, maxComputedStyles) ||
      !hoverSelectors.every((selector) => selectors.includes(selector)) ||
      (hoverSelectors.length === 0) !== (hoverComputedStyles.length === 0) ||
      !boundedStringArray(attributes, maxAttributes) ||
      !boundedStringArray(computedStyles, maxComputedStyles) ||
      !boundedStringArray(focusVisibleSelectors, maxSelectors) ||
      !boundedStringArray(focusVisibleComputedStyles, maxComputedStyles) ||
      typeof includeAllElements !== 'boolean'
    ) {
      throw new Error('Snapshot policy schema error');
    }
    return {
      selectors,
      inputValueSelectors,
      hoverSelectors,
      hoverComputedStyles,
      attributes,
      computedStyles,
      focusVisibleSelectors,
      focusVisibleComputedStyles,
      includeAllElements,
    };
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

  /** 有効なlabelledbyをlabelより優先し、無効な参照は既存の名前候補へ戻す。 */
  const accessibleName = (element: Element): string => {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy !== null) {
      const labels = labelledBy
        .split(/\s+/u)
        .filter(Boolean)
        .map((id) => document.getElementById(id))
        .filter((node): node is HTMLElement => node !== null && document.body.contains(node));
      if (labels.length > 0) {
        return normalizeText(
          labels
            .map((node) => node.getAttribute('aria-label')?.trim() || node.textContent)
            .join(' '),
        );
      }
    }
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel !== null && ariaLabel.trim().length > 0) return normalizeText(ariaLabel);
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

  /** 引用文字列とescapeを保ち、実際の状態pseudoだけを同じ特異性の属性へ移す。 */
  const controlledSelector = (
    selector: string,
    attributes: Readonly<Record<'focus' | 'hover', string>>,
  ): string => {
    let result = '';
    let quote: string | undefined;
    for (let index = 0; index < selector.length; index += 1) {
      const character = selector[index]!;
      if (character === '\\') {
        result += selector.slice(index, index + 2);
        index += 1;
        continue;
      }
      if (quote !== undefined) {
        result += character;
        if (character === quote) quote = undefined;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        result += character;
        continue;
      }
      const pseudo =
        character === ':'
          ? /^:(hover|focus-visible|focus)(?![-\w\\\u0080-\uFFFF])/iu.exec(selector.slice(index))
          : null;
      if (pseudo === null) {
        result += character;
        continue;
      }
      const state = pseudo[1]!.toLowerCase() === 'hover' ? 'hover' : 'focus';
      result += `[${attributes[state]}]`;
      index += pseudo[0].length - 1;
    }
    return result;
  };

  /** Rule本体・media・順序を動かさず状態を制御し、実pointer/focusとの混在を防ぐ。 */
  const installValidationStyles = (token: string) => {
    const suffix = Array.from(
      token,
      (character) => character.codePointAt(0)?.toString(36) ?? '0',
    ).join('-');
    const attributes = {
      focus: `data-tsumucode-focus-${suffix}`,
      hover: `data-tsumucode-hover-${suffix}`,
    };
    const changes: { readonly rule: CSSStyleRule; readonly selector: string }[] = [];
    /** このSnapshotで置換したSelectorを元のCSSOMへ戻す。 */
    const restore = (): void => {
      for (const { rule, selector } of changes) rule.selectorText = selector;
    };
    /** 読めるRuleだけを辿り、入れ子の各Selectorを独立に置換する。 */
    const visit = (rules: CSSRuleList): void => {
      for (const rule of [...rules]) {
        const candidate = rule as CSSStyleRule;
        if (typeof candidate.selectorText === 'string') {
          const selector = candidate.selectorText;
          const controlled = controlledSelector(selector, attributes);
          if (controlled !== selector) {
            changes.push({ rule: candidate, selector });
            candidate.selectorText = controlled;
            if (candidate.selectorText !== controlled) {
              throw new Error('検証用状態のSelectorを適用できません');
            }
          }
        }
        if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
      }
    };
    try {
      for (const stylesheet of [...document.styleSheets]) {
        let rules: CSSRuleList;
        try {
          rules = stylesheet.cssRules;
        } catch {
          continue;
        }
        visit(rules);
      }
    } catch (error) {
      restore();
      throw error;
    }
    return { attributes, restore };
  };

  /** 観測する1要素だけに状態属性を付け、元の属性値を必ず復元する。 */
  const activateValidationState = (
    element: Element,
    attribute: string,
    token: string,
  ): (() => void) => {
    const previous = element.getAttribute(attribute);
    element.setAttribute(attribute, token);
    return () => {
      if (previous === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, previous);
    };
  };

  /** 収集要求のあるPreview内の可視native text inputだけを捕捉getterで読む。 */
  const visibleInputValue = (
    element: Element,
    selectors: readonly string[],
  ): string | undefined => {
    if (
      selectors.length === 0 ||
      !(element instanceof NativeInput) ||
      element.ownerDocument !== document ||
      !document.body.contains(element) ||
      nativeInputValue === undefined ||
      nativeInputType === undefined ||
      applyNative(nativeInputType, element, []) !== 'text' ||
      !selectors.some((selector) => element.matches(selector))
    )
      return undefined;
    const rect = element.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      nativeComputedStyle(element).visibility !== 'visible'
    )
      return undefined;
    let current: Element | null = element;
    while (current !== null) {
      const style = nativeComputedStyle(current);
      const opacity = Number(style.opacity);
      if (style.display === 'none' || !Number.isFinite(opacity) || opacity <= 0) return undefined;
      current = current.parentElement;
    }
    const value: unknown = applyNative(nativeInputValue, element, []);
    return typeof value === 'string' ? value : undefined;
  };

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
      applyNative(nativePreventDefault, event, []);
    },
    true,
  );

  const trustedFocusSignalType = `tsumucode-focus-${config.bootstrapToken}`;
  let trustedFocusedElement: Element | null = null;
  document.addEventListener(
    'focusin',
    () => {
      trustedFocusedElement = null;
    },
    true,
  );
  document.addEventListener(
    trustedFocusSignalType,
    (event) => {
      if (event.target instanceof Element && document.documentElement.contains(event.target)) {
        trustedFocusedElement = event.target;
      }
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

    let restoreValidationStyles: (() => void) | undefined;
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
      const validationStyles =
        policy.focusVisibleSelectors.length > 0 || policy.hoverSelectors.length > 0
          ? installValidationStyles(message.oneTimeToken)
          : undefined;
      restoreValidationStyles = validationStyles?.restore;
      const baseNodes = elements.map((element, index) => {
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
        const attributes = objectFromEntries(
          policy.attributes.flatMap((name) => {
            if (!element.hasAttribute(name)) return [];
            outputString(name, 'attribute name', 256);
            const value = outputString(element.getAttribute(name) ?? '', 'attribute');
            return [[name, value]];
          }),
        );
        const computedStyles = objectFromEntries(
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
        const inputValue = visibleInputValue(element, policy.inputValueSelectors);
        return {
          ...(inputValue === undefined
            ? {}
            : { inputValue: outputString(inputValue, 'input value') }),
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
          focused: document.activeElement === element || trustedFocusedElement === element,
          accessibleName: outputString(
            isDocumentElement ? '' : accessibleName(element),
            'accessible name',
          ),
          role,
        };
      });
      const stateToken = message.oneTimeToken;
      /** 対象を1件ずつ有効化し、互いに独立した状態Styleを採る。 */
      const observeState = (
        selectors: readonly string[],
        properties: readonly string[],
        state: 'focus' | 'hover',
      ): Map<Element, Readonly<Record<string, string>>> => {
        const observations = new Map<Element, Readonly<Record<string, string>>>();
        if (
          selectors.length > 0 &&
          state === 'hover' &&
          !window.matchMedia('(hover: hover)').matches
        ) {
          throw new Error(
            'この環境ではhover描画を確認できません。hover対応の端末で確認してください。',
          );
        }
        for (const element of elements) {
          if (
            element.ownerDocument !== document ||
            !selectors.some((selector) => element.matches(selector))
          )
            continue;
          const attribute = validationStyles?.attributes[state];
          if (attribute === undefined) continue;
          const cleanup = activateValidationState(element, attribute, stateToken);
          try {
            document.documentElement.getBoundingClientRect();
            const style = getComputedStyle(element);
            observations.set(
              element,
              objectFromEntries(
                properties.map((name) => {
                  outputString(name, `${state} computed style name`, 256);
                  return [
                    name,
                    outputString(style.getPropertyValue(name), `${state} computed style`),
                  ];
                }),
              ),
            );
          } finally {
            cleanup();
          }
        }
        return observations;
      };
      const focusVisibleStyles = observeState(
        policy.focusVisibleSelectors,
        policy.focusVisibleComputedStyles,
        'focus',
      );
      const hoverStyles = observeState(policy.hoverSelectors, policy.hoverComputedStyles, 'hover');
      const nodes = baseNodes.map((node, index) => ({
        ...node,
        focusVisibleComputedStyles: focusVisibleStyles.get(elements[index]!) ?? {},
        ...(policy.hoverSelectors.length === 0
          ? {}
          : { hoverComputedStyles: hoverStyles.get(elements[index]!) ?? {} }),
      }));
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
    } finally {
      restoreValidationStyles?.();
    }
  });

  let readySent = false;
  const announceReady = (): void => {
    if (readySent) return;
    readySent = true;
    send('bridge.ready', 'ready', config.bootstrapToken, null);
  };
  /** Snapshotへ使う画像とFontのLayout寸法が確定するまで待つ。 */
  const waitForLayoutAssets = async (): Promise<void> => {
    const waits: Promise<unknown>[] = [];
    const fonts = (document as unknown as { readonly fonts?: FontFaceSet }).fonts;
    if (fonts !== undefined) waits.push(fonts.ready.catch(() => undefined));
    for (const image of Array.from(document.images)) {
      if (typeof image.decode !== 'function') continue;
      waits.push(image.decode().catch(() => undefined));
    }
    await Promise.all(waits);
  };
  const announceAfterLayout = (): void => {
    void (async () => {
      await waitForLayoutAssets();
      applyReducedMotionEmulation();
      document.documentElement.getBoundingClientRect();
      scheduleTask(announceReady, 0);
    })();
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
