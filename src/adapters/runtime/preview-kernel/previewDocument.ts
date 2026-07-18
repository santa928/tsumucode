/** Full／read-only共通でsanitized DOMだけをsrcdoc用Documentへ取り込む。 */
import { isAllowedStylesheetHref } from './sanitizeHtml';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const FORBIDDEN_ELEMENTS = new Set(['base', 'embed', 'iframe', 'object', 'script', 'template']);

/** srcdoc raw-textの`</style`再解釈を防ぎ、CSS上は同じ`<` code pointへ戻す。 */
export function escapeStyleRawText(value: string): string {
  return value.replaceAll('<', '\\3c ');
}

/** sanitizer出力がactive node・foreign namespace・実行属性を再混入していないか確認する。 */
function assertSanitizedDocument(documentValue: Document): void {
  if (
    documentValue.nodeType !== Node.DOCUMENT_NODE ||
    documentValue.documentElement.namespaceURI !== HTML_NAMESPACE
  ) {
    throw new Error('Invalid sanitized preview document');
  }
  for (const element of documentValue.querySelectorAll('*')) {
    const tag = element.tagName.toLowerCase();
    if (element.namespaceURI !== HTML_NAMESPACE || FORBIDDEN_ELEMENTS.has(tag)) {
      throw new Error('Invalid sanitized preview document');
    }
    if (tag === 'meta') {
      const attributeNames = [...element.attributes].map(({ name }) => name.toLowerCase());
      const isCharset =
        element.hasAttribute('charset') && attributeNames.every((name) => name === 'charset');
      const isViewport =
        element.getAttribute('name')?.trim().toLowerCase() === 'viewport' &&
        element.hasAttribute('content') &&
        attributeNames.every((name) => name === 'name' || name === 'content');
      if (!isCharset && !isViewport) throw new Error('Invalid sanitized preview document');
    }
    if (tag === 'link') {
      const rel = element.getAttribute('rel')?.trim().toLowerCase();
      const href = element.getAttribute('href');
      if (rel !== 'stylesheet' || href === null || !isAllowedStylesheetHref(href)) {
        throw new Error('Invalid sanitized preview document');
      }
    }
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      if (name === 'nonce' || name.startsWith('on')) {
        throw new Error('Invalid sanitized preview document');
      }
    }
  }
}

/** sanitized Elementの検証済み属性を新規Documentへcopyする。 */
function copyElementAttributes(source: Element, target: Element): void {
  for (const attribute of source.attributes) target.setAttribute(attribute.name, attribute.value);
}

/** sanitized childをimportし、stylesheet参照を実行DOMへ残さずhead/bodyへ追加する。 */
function importSanitizedChildren(source: ParentNode, target: HTMLElement, output: Document): void {
  for (const child of source.childNodes) {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      (child as Element).tagName.toLowerCase() === 'link'
    ) {
      continue;
    }
    target.appendChild(output.importNode(child, true));
  }
}

/** 検証済みroot・head・bodyだけを新規srcdoc用Documentへ再構築する。 */
export function createSanitizedPreviewDocument(sanitizedDocument: Document): Document {
  assertSanitizedDocument(sanitizedDocument);
  const output = document.implementation.createHTMLDocument('');
  output.head.replaceChildren();
  output.body.replaceChildren();
  copyElementAttributes(sanitizedDocument.documentElement, output.documentElement);
  copyElementAttributes(sanitizedDocument.body, output.body);
  importSanitizedChildren(sanitizedDocument.head, output.head, output);
  importSanitizedChildren(sanitizedDocument.body, output.body, output);
  for (const stylesheetReference of output.querySelectorAll('link')) {
    stylesheetReference.remove();
  }
  for (const learnerStyle of output.querySelectorAll('style')) {
    learnerStyle.textContent = escapeStyleRawText(learnerStyle.textContent);
  }
  return output;
}
