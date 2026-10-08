import { nextPreviewRequest } from './next-data-preview.mjs';
import { forwardPreviewResponse } from './preview-http-response.mjs';
import { createServer, request } from 'node:http';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { setTimeout, clearTimeout, setInterval, clearInterval } from 'node:timers';
import {
  CONTROL_SOCKET,
  TRANSPORT_ROOT,
  PREVIEW_PORT,
  PREVIEW_LIMITS,
  previewRunId,
  previewOrigin,
  previewRequestOrigin,
  previewBase,
  previewHeaders,
  previewRoute,
  previewResponseLimit,
  previewWebSocketProtocol,
} from './preview-contract.mjs';

const websocketConnections = new Set();
let httpConnections = 0;

/** lookup失敗時に古い接続先を使わない。管理token/Sourceはcontrol応答にも含めない。 */
function lookup() {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: CONTROL_SOCKET, method: 'GET', path: '/active' }, (res) => {
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 1024) res.destroy(new Error('Control response limit'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error('Preview is not ready');
          const target = JSON.parse(Buffer.concat(chunks).toString());
          previewRunId(target.runId);
          if (
            !/^[a-z0-9-]{1,64}$/u.test(target.workspaceId) ||
            !['vite-project-v1', 'next-project-v1'].includes(target.profile) ||
            !Number.isSafeInteger(target.dev) ||
            !Number.isSafeInteger(target.ino)
          )
            throw new Error('Invalid preview target');
          resolve(target);
        } catch (error) {
          reject(error);
        }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('Control deadline')), 1000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });
}

/** seal済みのroot所有親とsocket inodeを照合し、learnerのsymlinkを辿らせない。 */
async function socketPath(target) {
  const directory = join(TRANSPORT_ROOT, target.runId);
  const [parent, socket] = await Promise.all([
    lstat(directory),
    lstat(join(directory, 'http.sock')),
  ]);
  if (
    !parent.isDirectory() ||
    parent.uid !== 0 ||
    parent.gid !== 1000 ||
    parent.mode & 0o222 ||
    !socket.isSocket() ||
    socket.uid !== 1000 ||
    socket.gid !== 1000 ||
    socket.dev !== target.dev ||
    socket.ino !== target.ino
  )
    throw new Error('Invalid sealed socket');
  return join(directory, 'http.sock');
}

function permitted(req, target, websocket = false) {
  if (
    req.headers.host !== new URL(previewOrigin(target.runId)).host ||
    !previewRoute(req.url, target, websocket) ||
    (!websocket && !nextPreviewRequest(req, target))
  )
    return false;
  if (!previewRequestOrigin(req, target, websocket)) return false;
  if (websocket) {
    return (
      req.method === 'GET' &&
      req.headers.origin === previewOrigin(target.runId) &&
      req.headers.upgrade?.toLowerCase() === 'websocket' &&
      req.headers['sec-websocket-protocol'] === previewWebSocketProtocol(target.profile)
    );
  }
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  return (
    req.method === 'POST' &&
    req.url === `${previewBase(target.workspaceId, target.runId)}api/echo` &&
    ['application/x-www-form-urlencoded', 'application/json', 'text/plain'].includes(
      (req.headers['content-type'] ?? '').split(';')[0],
    )
  );
}

function upstreamHeaders(req, target) {
  // Cookie/Authorization/token/Forwarded等を自動転送しない。
  return {
    host: req.headers.host,
    ...nextPreviewRequest(req, target)?.headers,
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
    ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
  };
}

function errorResponse(res, status, target) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res
    .writeHead(status, {
      ...(target
        ? previewHeaders(target.runId, target.profile)
        : { 'content-security-policy': "default-src 'none'; sandbox" }),
      'content-type': 'text/plain; charset=utf-8',
    })
    .end('Previewを利用できません。管理画面の実行状態を確認してください。');
}

const server = createServer(async (req, res) => {
  let target;
  let proxy;
  let timer;
  let monitoring;
  if (httpConnections >= PREVIEW_LIMITS.httpConnections) {
    errorResponse(res, 429);
    return;
  }
  httpConnections++;
  res.once('close', () => {
    clearTimeout(timer);
    clearInterval(monitoring);
    httpConnections--;
  });
  try {
    target = await lookup();
    if (!permitted(req, target)) {
      errorResponse(res, 403, target);
      return;
    }
    const path = await socketPath(target);
    if (res.destroyed) return;
    proxy = request(
      {
        socketPath: path,
        path: req.url,
        method: req.method,
        headers: upstreamHeaders(req, target),
      },
      (upstream) => {
        forwardPreviewResponse(upstream, res, {
          method: req.method,
          headers: previewHeaders(target.runId, target.profile),
          limit: previewResponseLimit(req.url, target),
          stream: nextPreviewRequest(req, target).stream,
          fail: () => errorResponse(res, 502, target),
        });
      },
    );
    const disconnected = () => {
      if (!res.writableEnded) proxy.destroy();
    };
    res.once('close', disconnected);
    res.once('finish', () => res.off('close', disconnected));
    timer = setTimeout(() => proxy.destroy(new Error('Preview deadline')), PREVIEW_LIMITS.httpMs);
    monitoring = setInterval(() => {
      void lookup().then(
        (current) => {
          if (
            current.runId !== target.runId ||
            current.ino !== target.ino ||
            current.sourceRevision !== target.sourceRevision
          )
            proxy.destroy();
        },
        () => proxy.destroy(),
      );
    }, 500);
    proxy.on('error', () => errorResponse(res, 503, target));
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > PREVIEW_LIMITS.bodyBytes) {
        errorResponse(res, 413, target);
        proxy.destroy();
      }
    });
    req.on('error', () => proxy.destroy());
    req.pipe(proxy);
  } catch {
    proxy?.destroy();
    errorResponse(res, 503, target);
  }
});

server.on('upgrade', async (req, client, head) => {
  let proxy;
  let upstream;
  let timer;
  let monitoring;
  const connection = {};
  const close = () => {
    clearTimeout(timer);
    clearInterval(monitoring);
    client.destroy();
    upstream?.destroy();
    proxy?.destroy();
    websocketConnections.delete(connection);
  };
  client.on('error', close);
  client.once('close', close);
  if (websocketConnections.size >= PREVIEW_LIMITS.websocketConnections) {
    close();
    return;
  }
  websocketConnections.add(connection);
  try {
    const target = await lookup();
    if (client.destroyed || !permitted(req, target, true)) {
      close();
      return;
    }
    const path = await socketPath(target);
    if (client.destroyed) return;
    proxy = request({
      socketPath: path,
      method: 'GET',
      path: req.url,
      headers: {
        ...upstreamHeaders(req, target),
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': req.headers['sec-websocket-key'],
        'sec-websocket-version': '13',
        ...(previewWebSocketProtocol(target.profile)
          ? { 'sec-websocket-protocol': previewWebSocketProtocol(target.profile) }
          : {}),
      },
    });
    proxy.on('error', close);
    proxy.on('response', close);
    proxy.on('upgrade', (response, socket, upgradeHead) => {
      if (
        client.destroyed ||
        response.statusCode !== 101 ||
        response.headers['sec-websocket-protocol'] !== previewWebSocketProtocol(target.profile)
      ) {
        socket.destroy();
        close();
        return;
      }
      upstream = socket;
      clearTimeout(timer);
      timer = setTimeout(close, 60 * 60 * 1000);
      upstream.on('error', close);
      upstream.once('close', close);
      client.write(
        `HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${response.headers['sec-websocket-accept']}\r\n${previewWebSocketProtocol(target.profile) ? 'Sec-WebSocket-Protocol: vite-hmr\r\n' : ''}\r\n`,
      );
      let sent = head.length;
      let received = upgradeHead.length;
      client.on('data', (data) => {
        sent += data.length;
        if (sent > PREVIEW_LIMITS.websocketBytes) close();
      });
      upstream.on('data', (data) => {
        received += data.length;
        if (received > PREVIEW_LIMITS.websocketBytes) close();
      });
      if (head.length) upstream.write(head);
      if (upgradeHead.length) client.write(upgradeHead);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    timer = setTimeout(close, 5000);
    monitoring = setInterval(() => {
      void lookup().then((current) => {
        if (
          current.runId !== target.runId ||
          current.ino !== target.ino ||
          current.sourceRevision !== target.sourceRevision
        )
          close();
      }, close);
    }, 500);
    proxy.end();
  } catch {
    close();
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.maxHeadersCount = 32;
server.listen(PREVIEW_PORT, '0.0.0.0');
