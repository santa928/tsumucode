import { resolvePublicAsset } from '../../../shared/lib/resolvePublicAsset';

export const TAILWIND_COMPILER = {
  version: '4.3.2',
  path: 'tailwind-runtime/4.3.2/browser.global.js',
  bytes: 276_617,
  sha256: '0bc32045dd897c063f4966c608bbbe373e035fcafcb3dd8ee3b315d5e6165410',
} as const;

/** 同originの固定配布物だけをbounded streamで取得し、実行前に全bytesを照合する。 */
export function createTailwindCompilerLoader(
  baseUrl: string = import.meta.env.BASE_URL,
  fetchAsset: typeof fetch = globalThis.fetch.bind(globalThis),
): (signal: AbortSignal) => Promise<string> {
  let verified: string | undefined;
  return async (signal) => {
    signal.throwIfAborted();
    if (verified !== undefined) return verified;
    const url = new URL(resolvePublicAsset(baseUrl, TAILWIND_COMPILER.path), location.origin);
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
    const response = await fetchAsset(url, {
      signal: deadline,
      mode: 'same-origin',
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok || response.redirected || response.url !== url.href || !response.body) {
      throw new Error(
        'Tailwindの実行部を読み込めませんでした。編集内容を保ったまま再試行できます。',
      );
    }
    const bytes = new Uint8Array(TAILWIND_COMPILER.bytes);
    const reader = response.body.getReader();
    let length = 0;
    try {
      deadline.throwIfAborted();
      let result = await reader.read();
      while (!result.done) {
        deadline.throwIfAborted();
        if (length + result.value.byteLength > bytes.byteLength) {
          throw new Error('Tailwind実行部の容量が固定配布物と一致しません。');
        }
        bytes.set(result.value, length);
        length += result.value.byteLength;
        result = await reader.read();
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    if (length !== bytes.byteLength) throw new Error('Tailwind実行部の容量が一致しません。');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    deadline.throwIfAborted();
    const hash = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== TAILWIND_COMPILER.sha256) throw new Error('Tailwind実行部の内容が一致しません。');
    verified = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return verified;
  };
}
