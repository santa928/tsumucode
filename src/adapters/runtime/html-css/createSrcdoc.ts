/** CSP・trusted Bridge・sanitized learner DOMから独立Preview srcdocを構築する。 */
import {
  assertBridgeConfig,
  createBridgeSource,
  type BridgeStylesheetReference,
} from './bridgeSource';
import {
  createSanitizedPreviewDocument,
  escapeStyleRawText,
} from '../preview-kernel/previewDocument';

export interface CreatePreviewSrcdocInput {
  readonly sanitizedDocument: Document;
  readonly css: string;
  readonly nonce: string;
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly bootstrapToken?: string;
  readonly viewport: { readonly id: string; readonly width: number; readonly height: number };
}

const SAFE_NONCE = /^[a-z0-9_-]+$/iu;

/** CSP nonceとBridge configを埋め込み可能な有限値へ限定する。 */
function assertPreviewConfiguration(
  input: CreatePreviewSrcdocInput,
  bootstrapToken: string,
  stylesheetReferences: readonly BridgeStylesheetReference[],
): void {
  if (!SAFE_NONCE.test(input.nonce) || input.nonce.length > 128) {
    throw new Error('Invalid preview configuration');
  }
  assertBridgeConfig({
    exerciseSessionId: input.exerciseSessionId,
    executionRevision: input.executionRevision,
    bootstrapToken,
    viewport: input.viewport,
    stylesheetReferences,
  });
}

/** Sanitizer検証済みのhead stylesheet属性を、切り離した観測用データへ変換する。 */
function observableStylesheetReferences(
  sanitizedDocument: Document,
): readonly BridgeStylesheetReference[] {
  return [...sanitizedDocument.head.querySelectorAll('link')].map((link) => ({
    attributes: [...link.attributes].map(({ name, value }) => [name, value] as const),
  }));
}

/** CSP、trusted CSS／Bridge、sanitized contentの順でopaque iframe用srcdocを生成する。 */
export function createPreviewSrcdoc(input: CreatePreviewSrcdocInput): string {
  const bootstrapToken = input.bootstrapToken ?? input.nonce;
  const stylesheetReferences = observableStylesheetReferences(input.sanitizedDocument);
  assertPreviewConfiguration(input, bootstrapToken, stylesheetReferences);
  const output = createSanitizedPreviewDocument(input.sanitizedDocument);

  const csp = output.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = [
    "default-src 'none'",
    `script-src 'nonce-${input.nonce}'`,
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

  const bridge = output.createElement('script');
  bridge.setAttribute('nonce', input.nonce);
  bridge.setAttribute('data-tsumucode-preview-bridge', '');
  bridge.textContent = createBridgeSource({
    exerciseSessionId: input.exerciseSessionId,
    executionRevision: input.executionRevision,
    bootstrapToken,
    viewport: input.viewport,
    stylesheetReferences,
  });

  output.head.prepend(csp, style, bridge);
  return `<!doctype html>${output.documentElement.outerHTML}`;
}
