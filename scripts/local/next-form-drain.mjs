/**
 * 採点用Actionだけ、NextのRSC消費前にBrowser側の正常EOFを待つ。
 * trusted bridgeが上限内の全量を固定長で送った応答に限定し、元Responseを返す。
 * fetchの引数・signal・URL・本文は変更せず、再試行もしない。
 * page.addInitScriptで初期化時に実行するため、外部変数へ依存しない。
 */
export function installNextActionBodyDrain({ origin, base }) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const NativeRequest = globalThis.Request;
  const NativeURL = globalThis.URL;
  const actionPath = (path) => [base, base.slice(0, -1)].includes(path);
  globalThis.fetch = async (...args) => {
    const input = args[0];
    const url = new NativeURL(
      input instanceof NativeRequest ? input.url : input,
      globalThis.location.href,
    );
    const method = String(
      args[1]?.method ?? (input instanceof NativeRequest ? input.method : 'GET'),
    ).toUpperCase();
    const action =
      method === 'POST' && url.origin === origin && actionPath(url.pathname) && url.search === '';
    const response = await nativeFetch(...args);
    if (!action) return response;
    const actualUrl = new NativeURL(response.url);
    const sequence = response.headers.get('x-tsumucode-form-response');
    const length = response.headers.get('content-length');
    if (
      actualUrl.origin !== origin ||
      actualUrl.pathname !== url.pathname ||
      actualUrl.search !== '' ||
      response.redirected ||
      response.type !== 'basic' ||
      response.status !== 200 ||
      response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
        'text/x-component' ||
      response.headers.has('content-encoding') ||
      !/^[1-8]$/u.test(sequence ?? '') ||
      !/^\d{1,6}$/u.test(length ?? '') ||
      Number(length) > 512 * 1024
    )
      throw new Error('Actionの全量応答を確認できません。');
    // 元ResponseのURL/type/redirectedと未消費bodyを保ち、複製だけを読み切る。
    const bytes = await response.clone().arrayBuffer();
    if (bytes.byteLength !== Number(length) || bytes.byteLength > 512 * 1024)
      throw new Error('Actionの応答byte数が一致しません。');
    return response;
  };
}
