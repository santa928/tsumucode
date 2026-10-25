import { createServer, request } from 'node:http';
import console from 'node:console';
import { errorMonitor } from 'node:events';

let observedPostOrdinal = 0;
let socketOrdinal = 0;
const socketIds = new WeakMap();
const socketOwners = new WeakMap();

/** 異常文字列やURLを記録せず、数値の長さだけを残す。 */
function declaredLength(value) {
  return typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : null;
}

// 作者用診断。Browser内loopbackを実Composeへ渡し、originと認証を製品と同じに保つ。
export function bridge(port, hostname, { observeCookie = false } = {}) {
  const server = createServer((req, res) => {
    const observed =
      observeCookie &&
      port === 4175 &&
      req.method === 'POST' &&
      req.url?.startsWith('/w/next-ch04-l02-e01/');
    const postOrdinal = observed ? ++observedPostOrdinal : null;
    let response;
    let bytes = 0;
    let chunks = 0;
    const trace = (stage, fields = {}) => {
      if (observed)
        console.log(
          JSON.stringify({
            event: 'main-cookie-transport',
            boundary: 'bridge',
            postOrdinal,
            stage,
            epochMs: Date.now(),
            ...fields,
          }),
        );
    };
    trace('start');
    res.on('finish', () =>
      trace('downstream-finish', {
        bytes,
        chunks,
        writableFinished: res.writableFinished,
        upstreamComplete: response?.complete ?? null,
      }),
    );
    const upstream = request(
      {
        hostname,
        port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (reply) => {
        response = reply;
        trace('headers', {
          status: reply.statusCode,
          contentLength: declaredLength(reply.headers['content-length']),
          encoding:
            reply.headers['content-encoding'] === undefined
              ? 'identity'
              : ['identity', 'gzip', 'br', 'deflate'].includes(reply.headers['content-encoding'])
                ? reply.headers['content-encoding']
                : 'other',
        });
        reply.on('data', (chunk) => {
          bytes += chunk.length;
          chunks++;
        });
        reply.on('end', () =>
          trace('upstream-end', {
            bytes,
            chunks,
            complete: reply.complete,
            readableEnded: reply.readableEnded,
          }),
        );
        reply.on('aborted', () => trace('upstream-aborted', { bytes, complete: reply.complete }));
        reply.on(errorMonitor, () => trace('upstream-error', { bytes, complete: reply.complete }));
        reply.on('close', () =>
          trace('upstream-close', {
            bytes,
            complete: reply.complete,
            readableEnded: reply.readableEnded,
          }),
        );
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on('socket', (socket) => {
      if (!socketIds.has(socket)) socketIds.set(socket, ++socketOrdinal);
      socketOwners.set(socket, observed ? postOrdinal : 'other');
      trace('socket', {
        socketOrdinal: socketIds.get(socket),
        reusedSocket: upstream.reusedSocket,
      });
    });
    upstream.on('error', () => {
      trace('request-error', { bytes });
      res.destroy();
    });
    res.on('close', () => {
      trace('destroy-call', {
        cause: 'downstream-close',
        bytes,
        replyComplete: response?.complete ?? null,
        writableFinished: res.writableFinished,
        requestAlreadyDestroyed: upstream.destroyed,
        socketDestroyed: upstream.socket?.destroyed ?? null,
        socketOrdinal: upstream.socket ? socketIds.get(upstream.socket) : null,
        socketOwnerOrdinal: upstream.socket ? socketOwners.get(upstream.socket) : null,
      });
      upstream.destroy();
    });
    req.pipe(upstream);
  });
  server.on('upgrade', (req, client, head) => {
    const upstream = request({
      hostname,
      port,
      path: req.url,
      method: 'GET',
      headers: req.headers,
    });
    upstream.on('socket', (socket) => {
      if (!socketIds.has(socket)) socketIds.set(socket, ++socketOrdinal);
      socketOwners.set(socket, 'other');
    });
    upstream.on('upgrade', (reply, socket, pending) => {
      client.write(
        `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(reply.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n')}\r\n\r\n`,
      );
      if (head.length) socket.write(head);
      if (pending.length) client.write(pending);
      client.pipe(socket).pipe(client);
      client.on('close', () => socket.destroy());
      socket.on('close', () => client.destroy());
      socket.on('error', () => client.destroy());
    });
    upstream.on('error', () => client.destroy());
    upstream.on('response', (reply) => {
      reply.destroy();
      client.destroy();
    });
    client.on('error', () => upstream.destroy());
    upstream.end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
}
