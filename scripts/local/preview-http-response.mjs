import { Buffer } from 'node:buffer';

/** 固定ヘッダー・byte上限・応答型を保つ。採点用Actionだけは全量受信後に送れる。 */
export function forwardPreviewResponse(
  upstream,
  res,
  { method, headers, limit, stream, bufferStream = false, fail, complete },
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
  if (streaming) res.writeHead(status, { ...headers, 'content-type': type });
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
  upstream.on('end', () => {
    if (failed || res.destroyed) return;
    if (!streaming)
      res.writeHead(status, {
        ...headers,
        'content-type': type,
        ...(bufferStream ? { 'content-length': bytes } : {}),
      });
    res.end(method === 'HEAD' || streaming ? undefined : Buffer.concat(chunks), () => {
      if (res.writableFinished && !failed) complete?.();
    });
  });
}
