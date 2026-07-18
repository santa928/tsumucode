import { createSanitizedPreviewDocument, escapeStyleRawText } from './previewDocument';

export interface CreateStaticPreviewSrcdocInput {
  readonly sanitizedDocument: Document;
  readonly css: string;
}

/** scriptless frameでnative navigationや偽の操作可能semanticsを残さない。 */
function deactivateStaticAnchors(documentValue: Document): void {
  for (const anchor of documentValue.querySelectorAll('a')) {
    anchor.removeAttribute('href');
    anchor.removeAttribute('role');
    anchor.removeAttribute('tabindex');
  }
}

/** script権限を一切持たない静的opaque iframe用srcdocを構築する。 */
export function createStaticPreviewSrcdoc(input: CreateStaticPreviewSrcdocInput): string {
  const output = createSanitizedPreviewDocument(input.sanitizedDocument);
  deactivateStaticAnchors(output);
  const csp = output.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = [
    "default-src 'none'",
    "script-src 'none'",
    "script-src-attr 'none'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data: blob:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
  ].join('; ');
  const style = output.createElement('style');
  style.setAttribute('data-tsumucode-preview-style', '');
  style.textContent = escapeStyleRawText(input.css);
  output.head.prepend(csp, style);
  return `<!doctype html>${output.documentElement.outerHTML}`;
}
