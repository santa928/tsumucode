import { Buffer } from 'node:buffer';

/** 固定ヘッダー・byte上限・応答型を保ち、任意の送信直前検査は失敗時に応答を拒否する。 */
export function forwardPreviewResponse(
  upstream,
  res,
  { method, headers, limit, stream, bufferStream = false, fail, complete, beforeHeaders },
) {
  let failed = false;
  const reject = () => {
    if (failed) return;
    failed = true;
    upstream.destroy();
    fail();
  };
  upstream.on('error', reject);
  upstream.on('aborted', reject);
  const status = upstream.statusCode ?? 502;
  const type = upstream.headers['content-type'] ?? 'application/octet-stream';
  if (
    (status >= 300 && status < 400) ||
    (stream &&
      (typeof type !== 'string' ||
        !['text/html', 'text/x-component'].includes(type.split(';')[0].trim().toLowerCase())))
  ) {
    reject();
    return;
  }
  const chunks = [];
  let bytes = 0;
  const streaming = stream && !bufferStream;
  // 非逐次応答ではEOF後、逐次応答では最初のbyte前に現在の許可を取り直す。
  const writeHeaders = async () => {
    const additional = await beforeHeaders?.();
    if (failed || res.destroyed) return false;
    res.writeHead(status, {
      ...headers,
      ...additional,
      'content-type': type,
      ...(bufferStream ? { 'content-length': bytes } : {}),
    });
    return true;
  };
  if (streaming) upstream.pause();
  upstream.on('data', (chunk) => {
    bytes += chunk.length;
    if (failed || res.destroyed) return;
    if (bytes > limit) {
      reject();
      return;
    }
    if (!streaming) chunks.push(chunk);
    else if (method !== 'HEAD' && !res.write(chunk)) {
      upstream.pause();
      res.once('drain', () => upstream.resume());
    }
  });
  upstream.on('end', async () => {
    if (failed || res.destroyed) return;
    try {
      if (!streaming && !(await writeHeaders())) return;
      if (failed || res.destroyed) return;
      res.end(method === 'HEAD' || streaming ? undefined : Buffer.concat(chunks), () => {
        if (res.writableFinished && !failed) complete?.();
      });
    } catch {
      reject();
    }
  });
  if (streaming)
    void writeHeaders().then((written) => {
      if (written) upstream.resume();
    }, reject);
}
