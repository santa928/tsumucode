import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { nextWorkspace } from './next-project-protocol.mjs';

/** 固定imageのAPI原稿を使い、保存版ごとに独立した制御データを作る。 */
export async function nextDataBackend(workspaceId, base) {
  const contract = nextWorkspace(workspaceId);
  const kind =
    contract?.goal === 'data-cache-revalidation'
      ? 'sample'
      : contract?.goal === 'loading-error-not-found'
        ? 'weather'
        : undefined;
  if (!kind) throw new Error('Controlled data workspace required');
  // readonly image作成時に正本から変換する。実行時にTS変換器を常駐させない。
  const compiled = JSON.parse(
    await readFile(new URL('./next-data-api.json', import.meta.url), 'utf8'),
  );
  const source = compiled[workspaceId];
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  const get = module.createBackend();
  const queries =
    kind === 'sample'
      ? ['mode=fresh', 'mode=cached', 'mode=revalidate', 'control=inspect']
      : [
          'state=clear',
          'state=slow',
          'state=flaky',
          'state=missing',
          'control=reset',
          'control=inspect',
        ];
  let retired = false;
  return {
    /** 同じ隔離の固定GETだけを処理し、その他の転送方針は呼出元へ返す。 */
    handle(req, res) {
      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1:5174');
      } catch {
        return false;
      }
      if (req.method !== 'GET' || url.pathname !== `${base}/api/${kind}`) return false;
      if (!queries.includes(url.search.slice(1))) {
        res.writeHead(404).end();
        return true;
      }
      if (retired) {
        res.writeHead(503).end();
        return true;
      }
      void Promise.resolve(get(new globalThis.Request(url)))
        .then(async (reply) => {
          const body = Buffer.from(await reply.arrayBuffer());
          if (retired) {
            res.destroy();
            return;
          }
          if (res.destroyed || res.writableEnded) return;
          res.writeHead(reply.status, { 'content-type': 'application/json' });
          res.end(body);
        })
        .catch(() => res.destroy());
      return true;
    },
    /** 旧保存版の遅延応答を、新しい保存版の応答として返さない。 */
    retire() {
      retired = true;
    },
  };
}
