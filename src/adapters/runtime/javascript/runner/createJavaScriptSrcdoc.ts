/** sanitized HTML/CSS、Snapshot Bridge、検証済みJavaScript sourceからopaque srcdocを作る。 */
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
  readonly runtimeSource: string;
}

const SAFE_NONCE = /^[a-z0-9_-]+$/iu;
const MAX_RUNTIME_SOURCE_BYTES = 256 * 1024;
const UTF8 = new TextEncoder();

/** runtime sourceをraw-textから隔離し、iframe自身が所有するBlobとして読み込むloaderを作る。 */
function createRuntimeLoaderSource(runtimeSource: string): string {
  if (UTF8.encode(runtimeSource).byteLength > MAX_RUNTIME_SOURCE_BYTES) {
    throw new Error('JavaScript runtime source exceeds srcdoc limit');
  }
  const sourceLiteral = JSON.stringify(runtimeSource)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
  return [
    '(function(){"use strict";',
    `const source=${sourceLiteral};`,
    'const loader=document.currentScript;',
    'const objectUrl=URL.createObjectURL(new Blob([source],{type:"text/javascript;charset=utf-8"}));',
    'const runtime=document.createElement("script");',
    'runtime.setAttribute("data-tsumucode-javascript-runtime-execution","");',
    'runtime.src=objectUrl;',
    'const release=()=>URL.revokeObjectURL(objectUrl);',
    'runtime.addEventListener("load",release,{once:true});',
    'runtime.addEventListener("error",release,{once:true});',
    'loader?.remove();',
    'document.head.append(runtime);',
    '})();',
  ].join('');
}

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
  const runtimeLoaderSource = createRuntimeLoaderSource(input.runtimeSource);
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
  runtime.setAttribute('nonce', input.nonce);
  runtime.setAttribute('data-tsumucode-javascript-runtime', '');
  runtime.textContent = runtimeLoaderSource;
  output.head.prepend(csp, style, snapshotBridge, runtime);
  return `<!doctype html>${output.documentElement.outerHTML}`;
}
