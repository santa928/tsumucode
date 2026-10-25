import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { errorMonitor } from 'node:events';

let observedPostOrdinal = 0;

/** body・URL・全headerを出さず、固定分類と数値だけを記録する。 */
function encodingClass(value) {
  return value === undefined
    ? 'identity'
    : ['identity', 'gzip', 'br', 'deflate'].includes(value)
      ? value
      : 'other';
}

/** HTTP長さとして一意に読める数値以外は不明のまま残す。 */
function declaredLength(value) {
  return typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : null;
}

/**
 * 固定ヘッダー・byte上限・応答型を保つ。
 * beforeHeadersは送信直前に追加ヘッダー（またはそのPromise）を返すtrusted検査。
 * 失敗時は応答を拒否し、待機中に切断された場合もheadersを発行しない。
 */
export function forwardPreviewResponse(
  upstream,
  res,
  { method, headers, limit, stream, bufferStream = false, fail, complete, beforeHeaders },
) {
  const postOrdinal =
    bufferStream && method === 'POST' && process.env.TSUMUCODE_COOKIE_DIAGNOSTICS === '1'
      ? ++observedPostOrdinal
      : null;
  const trace = (stage, fields = {}) => {
    if (postOrdinal !== null)
      console.log(
        JSON.stringify({
          event: 'main-cookie-transport',
          boundary: 'preview',
          postOrdinal,
          stage,
          epochMs: Date.now(),
          ...fields,
        }),
      );
  };
  let bytes = 0;
  let observedChunks = 0;
  let failed = false;
  const reject = () => {
    if (failed) return;
    trace('reject', {
      limitExceeded: bytes > limit,
      upstreamComplete: upstream.complete,
      upstreamAborted: upstream.aborted,
      downstreamDestroyed: res.destroyed,
      headersSent: res.headersSent,
    });
    failed = true;
    upstream.destroy();
    fail();
  };
  trace('start', {
    bufferStream,
    upstreamContentLength: declaredLength(upstream.headers['content-length']),
    encoding: encodingClass(upstream.headers['content-encoding']),
  });
  upstream.on('aborted', () =>
    trace('upstream-aborted', { bytes, upstreamComplete: upstream.complete }),
  );
  upstream.on(errorMonitor, () =>
    trace('upstream-error', { bytes, upstreamComplete: upstream.complete }),
  );
  upstream.on('close', () =>
    trace('upstream-close', {
      bytes,
      chunks: observedChunks,
      upstreamComplete: upstream.complete,
      readableEnded: upstream.readableEnded,
    }),
  );
  res.on('finish', () =>
    trace('downstream-finish', {
      bytesQueued: bytes,
      writableFinished: res.writableFinished,
    }),
  );
  res.on('close', () =>
    trace('downstream-close', {
      bytesQueued: bytes,
      writableFinished: res.writableFinished,
      destroyed: res.destroyed,
    }),
  );
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
  const streaming = stream && !bufferStream;
  // 非逐次応答ではEOF後、逐次応答では最初のbyte前に現在の許可を取り直す。
  const writeHeaders = async () => {
    const additional = await beforeHeaders?.();
    if (failed || res.destroyed) return false;
    trace('headers', {
      status,
      bodyBytesQueued: bytes,
      contentLength: bufferStream ? bytes : null,
      upstreamComplete: upstream.complete,
    });
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
    observedChunks++;
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
    trace('upstream-end', {
      bytes,
      chunks: observedChunks,
      upstreamComplete: upstream.complete,
      readableEnded: upstream.readableEnded,
    });
    if (failed || res.destroyed) return;
    try {
      if (!streaming && !(await writeHeaders())) return;
      if (failed || res.destroyed) return;
      res.end(method === 'HEAD' || streaming ? undefined : Buffer.concat(chunks), () => {
        trace('end-callback', {
          writableFinished: res.writableFinished,
          failed,
        });
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
