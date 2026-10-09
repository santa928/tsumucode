import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';

/** trusted bridgeの各POSTを有限連番で結び、古い送信の完了を再利用しない。 */
export function createNextFormResponses(origin) {
  const records = new Map();
  return {
    begin(method, path) {
      if (method !== 'POST' || records.size >= 8) return undefined;
      const request = records.size + 1;
      const record = { request, method, path, status: undefined, complete: false, failed: false };
      records.set(request, record);
      return record;
    },
    /** Browserの完了通知ではなく、対応する実Responseと正常転送の終端を照合する。 */
    async completed(response, expectedRequest) {
      if (response.headers()['x-tsumucode-form-response'] !== String(expectedRequest)) return false;
      const record = records.get(expectedRequest);
      const url = new URL(response.url());
      if (
        !record ||
        url.origin !== origin ||
        url.pathname + url.search !== record.path ||
        response.request().method() !== record.method ||
        response.status() !== record.status
      )
        return false;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (record.failed) return false;
        if (record.complete) return true;
        await delay(25);
      }
      return false;
    },
  };
}
