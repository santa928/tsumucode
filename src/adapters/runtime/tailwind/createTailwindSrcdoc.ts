import { createPreviewSrcdoc, type CreatePreviewSrcdocInput } from '../html-css/createSrcdoc';
import { restrictTailwindClasses } from './validateSource';

/** 固定compilerの出力styleだけを観測し、Utility生成の実Style確認後にBridgeを開始する。 */
function compilerReadyRuntime(startBridge: () => void, executeCompiler: () => void): void {
  const bootstrap = document.currentScript;
  const sentinel = document.createElement('div');
  sentinel.hidden = true;
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.className = 'gap-[313px]';
  document.body.append(sentinel);
  const before = new Set(document.head.querySelectorAll('style'));
  executeCompiler();
  const outputs = [...document.head.querySelectorAll('style')].filter(
    (style) => !before.has(style),
  );
  const candidate = outputs[0];
  if (
    outputs.length !== 1 ||
    candidate === undefined ||
    (candidate.getAttribute('type') ?? '') !== ''
  )
    return;
  const output = candidate;
  let completed = false;
  const observer = new MutationObserver(checkReady);
  const deadline = setTimeout(() => {
    observer.disconnect();
  }, 4_900);

  /** sentinel宣言が捕捉したstyle自身にあることを、別styleの見た目と区別する。 */
  function containsSentinel(rules: CSSRuleList): boolean {
    for (const rule of rules) {
      if (
        rule instanceof CSSStyleRule &&
        rule.selectorText === `.${CSS.escape('gap-[313px]')}` &&
        rule.style.getPropertyValue('gap') === '313px'
      )
        return true;
      if (rule instanceof CSSGroupingRule && containsSentinel(rule.cssRules)) return true;
    }
    return false;
  }

  /** 空styleやpreflightだけでは認証Bridgeを起動しない。 */
  function checkReady(): void {
    if (completed || !output.isConnected || output.textContent === '') return;
    if (output.sheet === null || !containsSentinel(output.sheet.cssRules)) return;
    if (getComputedStyle(sentinel).gap !== '313px') return;
    completed = true;
    observer.disconnect();
    clearTimeout(deadline);
    sentinel.remove();
    bootstrap?.remove();
    startBridge();
  }
  observer.observe(output, { childList: true, subtree: true, characterData: true });
  checkReady();
  window.addEventListener(
    'pagehide',
    () => {
      observer.disconnect();
      clearTimeout(deadline);
    },
    { once: true },
  );
}

/** 学習DOM全量の後で、nonce script内の固定bundleと遅延Bridgeを直接実行する。 */
export function createTailwindSrcdoc(input: CreatePreviewSrcdocInput, compiler: string): string {
  restrictTailwindClasses(input.sanitizedDocument);
  const output = new DOMParser().parseFromString(createPreviewSrcdoc(input), 'text/html');
  const script = output.querySelector<HTMLScriptElement>('[data-tsumucode-preview-bridge]');
  if (script === null) throw new Error('Tailwindのプレビュー構築に失敗しました。');
  const bridge = script.textContent;
  script.textContent =
    `(${compilerReadyRuntime.toString()})(function () {\n${bridge}\n}, function () {\n${compiler}\n});`.replace(
      /<\/script/giu,
      '<\\/script',
    );
  output.body.append(script);
  return `<!doctype html>${output.documentElement.outerHTML}`;
}
