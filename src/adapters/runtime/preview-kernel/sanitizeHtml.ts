/** Full／read-only共通でLearner HTMLを安全なnodeとattributeだけへ再構築する。 */
import type { ResolvedPreviewAsset, RunnerDiagnostic } from '../../../core/runtime/contracts';
import { resolvePublicAsset } from '../../../shared/lib/resolvePublicAsset';
import { resolvePreviewAssetUrl, sanitizeCss } from './sanitizeCss';

export interface SanitizedHtml {
  readonly document: Document;
  readonly diagnostics: readonly RunnerDiagnostic[];
}

export interface SanitizeHtmlOptions {
  readonly acknowledgedScriptFile?: string;
}

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const SAFE_TAGS = new Set([
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'b',
  'bdi',
  'bdo',
  'blockquote',
  'br',
  'button',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'dd',
  'del',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'i',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'legend',
  'li',
  'link',
  'main',
  'mark',
  'menu',
  'meta',
  'meter',
  'nav',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'pre',
  'progress',
  'q',
  's',
  'samp',
  'section',
  'select',
  'small',
  'span',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'u',
  'ul',
  'var',
  'wbr',
]);
const DROP_SUBTREE_TAGS = new Set([
  'base',
  'embed',
  'iframe',
  'noscript',
  'object',
  'script',
  'template',
]);
const GLOBAL_ATTRIBUTES = new Set([
  'class',
  'dir',
  'hidden',
  'id',
  'lang',
  'role',
  'style',
  'tabindex',
  'title',
]);
const TAG_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(['href', 'rel']),
  button: new Set(['disabled', 'name', 'type', 'value']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  data: new Set(['value']),
  details: new Set(['open']),
  form: new Set(['novalidate']),
  img: new Set(['alt', 'decoding', 'height', 'loading', 'src', 'width']),
  input: new Set([
    'autocomplete',
    'checked',
    'disabled',
    'max',
    'maxlength',
    'min',
    'minlength',
    'name',
    'pattern',
    'placeholder',
    'readonly',
    'required',
    'step',
    'type',
    'value',
  ]),
  label: new Set(['for']),
  li: new Set(['value']),
  link: new Set(['href', 'rel']),
  meta: new Set(['charset', 'content', 'name']),
  meter: new Set(['high', 'low', 'max', 'min', 'optimum', 'value']),
  ol: new Set(['reversed', 'start', 'type']),
  optgroup: new Set(['disabled', 'label']),
  option: new Set(['disabled', 'label', 'selected', 'value']),
  output: new Set(['for', 'name']),
  progress: new Set(['max', 'value']),
  select: new Set(['disabled', 'multiple', 'name', 'required', 'size']),
  td: new Set(['colspan', 'headers', 'rowspan']),
  textarea: new Set([
    'cols',
    'disabled',
    'maxlength',
    'minlength',
    'name',
    'placeholder',
    'readonly',
    'required',
    'rows',
    'wrap',
  ]),
  th: new Set(['abbr', 'colspan', 'headers', 'rowspan', 'scope']),
  time: new Set(['datetime']),
};
const COMMUNICATION_ATTRIBUTES = new Set([
  'action',
  'cite',
  'data',
  'formaction',
  'manifest',
  'method',
  'ping',
  'poster',
  'srcdoc',
  'srcset',
  'target',
]);
const IMAGE_MEDIA_TYPES = new Set<ResolvedPreviewAsset['mediaType']>(['image']);

/** trusted Runnerが指定したworkspace script pathを比較用のcanonical値へ変換する。 */
function canonicalAcknowledgedScriptFile(file: string | undefined): string | undefined {
  if (file === undefined) return undefined;
  try {
    return resolvePublicAsset('/', file).slice(1);
  } catch {
    throw new Error('Acknowledged script file must be a safe relative path');
  }
}

/** 実行せず除去することが分かっている単一の外部script参照か確認する。 */
function isAcknowledgedScriptReference(element: Element, acknowledgedFile: string): boolean {
  if (
    element.namespaceURI !== HTML_NAMESPACE ||
    element.tagName.toLowerCase() !== 'script' ||
    element.attributes.length !== 1 ||
    element.attributes[0]?.name.toLowerCase() !== 'src' ||
    element.textContent.trim().length > 0
  ) {
    return false;
  }
  const source = element.getAttribute('src');
  if (source === null) return false;
  try {
    return resolvePublicAsset('/', source).slice(1) === acknowledgedFile;
  } catch {
    return false;
  }
}

/** Security診断を共通Runtime契約へ変換する。 */
function diagnostic(
  code: string,
  learnerMessage: string,
  severity: RunnerDiagnostic['severity'] = 'warning',
): RunnerDiagnostic {
  return {
    code,
    kind: 'security',
    severity,
    message: learnerMessage,
    learnerMessage,
  };
}

/** ASCII control文字またはDELをURL表記から検出する。 */
function containsAsciiControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

/** Anchor hrefとしてhttps／fragment／sandbox内の安全な相対URLだけを許可する。 */
function allowedAnchorHref(value: string): boolean {
  if (value.length === 0 || value !== value.trim() || containsAsciiControl(value)) return false;
  if (value.startsWith('#')) return !value.includes('\\');
  if (/^https:\/\//iu.test(value)) {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }
  if (value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return false;
  const path = value.split(/[?#]/u, 1)[0]!;
  if (path.length === 0) return false;
  try {
    resolvePublicAsset('/', path);
    return true;
  } catch {
    return false;
  }
}

/** External stylesheet参照をworkspace内のcanonical相対pathだけへ限定する。 */
export function isAllowedStylesheetHref(value: string): boolean {
  try {
    resolvePublicAsset('/', value);
    return true;
  } catch {
    return false;
  }
}

/** Element attributeを名前・tag・URL・CSS境界で検証して新規Elementへcopyする。 */
function copySafeAttributes(
  source: Element,
  target: Element,
  tag: string,
  assets: readonly ResolvedPreviewAsset[],
  diagnostics: RunnerDiagnostic[],
): void {
  for (const attribute of source.attributes) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    if (name.startsWith('data-tsumucode-')) {
      diagnostics.push(
        diagnostic('HTML_RESERVED_ATTRIBUTE_REMOVED', `${attribute.name}属性は予約済みです`),
      );
      continue;
    }
    if (name.startsWith('on')) {
      diagnostics.push(diagnostic('HTML_EVENT_REMOVED', `${attribute.name}属性は使えません`));
      continue;
    }
    const allowed =
      GLOBAL_ATTRIBUTES.has(name) ||
      name.startsWith('aria-') ||
      name.startsWith('data-') ||
      TAG_ATTRIBUTES[tag]?.has(name) === true;
    if (!allowed) {
      if (COMMUNICATION_ATTRIBUTES.has(name)) {
        diagnostics.push(
          diagnostic('HTML_ATTRIBUTE_REMOVED', `${attribute.name}属性はプレビューで使えません`),
        );
      }
      continue;
    }
    if (tag === 'a' && name === 'href') {
      if (!allowedAnchorHref(value)) {
        diagnostics.push(
          diagnostic(
            'HTML_URL_REMOVED',
            'このリンクURLはプレビューでは使えません',
            /^[a-z][a-z\d+.-]*:/iu.test(value) ? 'error' : 'warning',
          ),
        );
        continue;
      }
      target.setAttribute(name, value);
      continue;
    }
    if (tag === 'img' && name === 'src') {
      const resolved = resolvePreviewAssetUrl(value, assets, IMAGE_MEDIA_TYPES);
      if (resolved === undefined) {
        diagnostics.push(diagnostic('HTML_URL_REMOVED', '教材に含まれない画像URLを外しました'));
        continue;
      }
      target.setAttribute(name, resolved);
      target.setAttribute('data-tsumucode-asset-id', value.slice('asset:'.length));
      continue;
    }
    if (name === 'style') {
      const sanitized = sanitizeCss(value, assets);
      target.setAttribute(name, sanitized.css);
      diagnostics.push(...sanitized.diagnostics);
      continue;
    }
    target.setAttribute(name, value);
  }
}

/** learner HTMLを別Documentへ再構築し、元Nodeや未検証attributeを持ち込まない。 */
export function sanitizeHtml(
  source: string,
  assets: readonly ResolvedPreviewAsset[],
  options: SanitizeHtmlOptions = {},
): SanitizedHtml {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const clean = document.implementation.createHTMLDocument('');
  clean.head.replaceChildren();
  clean.body.replaceChildren();
  const diagnostics: RunnerDiagnostic[] = [];
  const acknowledgedScriptFile = canonicalAcknowledgedScriptFile(options.acknowledgedScriptFile);
  let acknowledgedScriptRemoved = false;

  const rebuild = (node: Node, parent: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(clean.createTextNode(node.textContent ?? ''));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const sourceElement = node as Element;
    const tag = sourceElement.tagName.toLowerCase();
    if (
      !acknowledgedScriptRemoved &&
      acknowledgedScriptFile !== undefined &&
      isAcknowledgedScriptReference(sourceElement, acknowledgedScriptFile)
    ) {
      acknowledgedScriptRemoved = true;
      return;
    }
    if (sourceElement.namespaceURI !== HTML_NAMESPACE || DROP_SUBTREE_TAGS.has(tag)) {
      diagnostics.push(
        diagnostic('HTML_UNSAFE_NODE_REMOVED', `<${tag}>はプレビューで使えないため外しました`),
      );
      return;
    }
    if (!SAFE_TAGS.has(tag)) {
      diagnostics.push(
        diagnostic('HTML_UNSAFE_NODE_REMOVED', `<${tag}>はプレビューで使えないため外しました`),
      );
      for (const child of sourceElement.childNodes) rebuild(child, parent);
      return;
    }
    const isSafeMeta =
      tag !== 'meta' ||
      sourceElement.hasAttribute('charset') ||
      (sourceElement.getAttribute('name')?.trim().toLowerCase() === 'viewport' &&
        sourceElement.hasAttribute('content'));
    if (!isSafeMeta) {
      diagnostics.push(
        diagnostic(
          'HTML_UNSAFE_NODE_REMOVED',
          '<meta>はcharsetまたはviewport指定だけプレビューで使えます',
        ),
      );
      return;
    }
    if (tag === 'link') {
      const rel = sourceElement.getAttribute('rel')?.trim().toLowerCase();
      const href = sourceElement.getAttribute('href');
      if (rel !== 'stylesheet' || href === null || !isAllowedStylesheetHref(href)) {
        diagnostics.push(
          diagnostic('HTML_URL_REMOVED', 'この外部CSS参照はプレビューでは使えません'),
        );
        return;
      }
    }

    const element = clean.createElement(tag);
    copySafeAttributes(sourceElement, element, tag, assets, diagnostics);
    if (tag === 'style') {
      const sanitized = sanitizeCss(sourceElement.textContent, assets);
      element.textContent = sanitized.css;
      diagnostics.push(...sanitized.diagnostics);
    } else {
      for (const child of sourceElement.childNodes) rebuild(child, element);
    }
    parent.appendChild(element);
  };

  copySafeAttributes(parsed.documentElement, clean.documentElement, 'html', assets, diagnostics);
  copySafeAttributes(parsed.body, clean.body, 'body', assets, diagnostics);
  for (const child of parsed.head.childNodes) rebuild(child, clean.head);
  for (const child of parsed.body.childNodes) rebuild(child, clean.body);
  return { document: clean, diagnostics };
}
