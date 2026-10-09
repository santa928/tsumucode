import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';

export class PreviewBodyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 上限と期限内の本文を全量受信する。失敗時には上流へ一部も送らない。 */
export function readPreviewBody(req, { limit, timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.off('data', data);
      req.off('end', end);
      req.off('error', disconnected);
      req.off('aborted', disconnected);
      signal?.removeEventListener('abort', disconnected);
      if (error) {
        req.pause();
        reject(error);
      } else resolve(Buffer.concat(chunks));
    };
    const data = (chunk) => {
      bytes += chunk.length;
      if (bytes > limit) finish(new PreviewBodyError(413, 'Preview body limit'));
      else chunks.push(chunk);
    };
    const end = () => finish();
    const disconnected = () => finish(new PreviewBodyError(408, 'Preview body disconnected'));
    const timer = setTimeout(
      () => finish(new PreviewBodyError(504, 'Preview body deadline')),
      timeoutMs,
    );
    req.on('data', data);
    req.once('end', end);
    req.once('error', disconnected);
    req.once('aborted', disconnected);
    signal?.addEventListener('abort', disconnected, { once: true });
    if (signal?.aborted || req.aborted) disconnected();
    else if (req.readableEnded) end();
  });
}
