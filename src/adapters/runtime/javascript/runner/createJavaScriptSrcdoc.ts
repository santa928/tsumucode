/** sanitized HTML/CSS、Snapshot Bridge、検証済みJavaScript blobからopaque srcdocを作る。 */
import {
  assertBridgeConfig,
  createBridgeSource,
  type BridgeStylesheetReference,
} from '../../html-css/bridgeSource';
import {
  createSanitizedPreviewDocument,
  escapeStyleRawText,
} from '../../preview-kernel/previewDocument';

export interface CreateJavaScriptSrcdocInput {
  readonly sanitizedDocument: Document;
  readonly css: string;
  readonly nonce: string;
  readonly bootstrapToken: string;
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly viewport: {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly reducedMotion?: 'reduce' | undefined;
  };
  readonly runtimeUrl: string;
}

const SAFE_NONCE = /^[a-z0-9_-]+$/iu;

/** Sanitizer済みheadのstylesheet参照をSnapshot観測用の値へ変換する。 */
function stylesheetReferences(documentValue: Document): readonly BridgeStylesheetReference[] {
  return [...documentValue.head.querySelectorAll('link')].map((link) => ({
    attributes: [...link.attributes].map(({ name, value }) => [name, value] as const),
  }));
}

/** CSP、Bridge、runtime、sanitized contentの順でJavaScript Previewを構成する。 */
export function createJavaScriptSrcdoc(input: CreateJavaScriptSrcdocInput): string {
  if (!SAFE_NONCE.test(input.nonce) || input.nonce.length > 128) {
    throw new Error('Invalid JavaScript preview nonce');
  }
  if (!/^blob:[^\s]+$/u.test(input.runtimeUrl) || /["'<>]/u.test(input.runtimeUrl)) {
    throw new Error('Invalid JavaScript runtime URL');
  }
  const references = stylesheetReferences(input.sanitizedDocument);
  assertBridgeConfig({
    exerciseSessionId: input.exerciseSessionId,
    executionRevision: input.executionRevision,
    bootstrapToken: input.bootstrapToken,
    viewport: input.viewport,
    stylesheetReferences: references,
  });
  const output = createSanitizedPreviewDocument(input.sanitizedDocument);
  const csp = output.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = [
    "default-src 'none'",
    `script-src 'nonce-${input.nonce}' blob:`,
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

  const snapshotBridge = output.createElement('script');
  snapshotBridge.setAttribute('nonce', input.nonce);
  snapshotBridge.setAttribute('data-tsumucode-preview-bridge', '');
  snapshotBridge.textContent = createBridgeSource({
    exerciseSessionId: input.exerciseSessionId,
    executionRevision: input.executionRevision,
    bootstrapToken: input.bootstrapToken,
    viewport: input.viewport,
    stylesheetReferences: references,
  });

  const runtime = output.createElement('script');
  runtime.setAttribute('src', input.runtimeUrl);
  runtime.setAttribute('data-tsumucode-javascript-runtime', '');
  output.head.prepend(csp, style, snapshotBridge, runtime);
  return `<!doctype html>${output.documentElement.outerHTML}`;
}
