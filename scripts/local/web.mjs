import { createServer, request } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { ORIGIN } from './protocol.mjs';

const root = '/app/dist';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

/** 実行先を固定したproxyと静的配信のみ。webにDocker socketは渡さない。 */
const server = createServer(async (req, res) => {
  if (req.headers.host !== new URL(ORIGIN).host) {
    res.writeHead(403).end();
    return;
  }
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'no-store');
  if (req.url?.startsWith('/api/')) {
    const proxy = request(
      {
        hostname: 'controller',
        port: 4174,
        path: req.url,
        method: req.method,
        headers: {
          host: req.headers.host,
          origin: req.headers.origin ?? '',
          'content-type': req.headers['content-type'] ?? '',
          'x-tsumucode-token': req.headers['x-tsumucode-token'] ?? '',
          'sec-fetch-site': req.headers['sec-fetch-site'] ?? '',
        },
      },
      (response) => {
        if (res.destroyed) {
          response.destroy();
          return;
        }
        res.writeHead(response.statusCode ?? 503, response.headers);
        response.pipe(res);
      },
    );
    const disconnected = () => {
      if (!res.writableEnded) proxy.destroy();
    };
    res.once('close', disconnected);
    res.once('finish', () => res.off('close', disconnected));
    proxy.setTimeout(15000, () => proxy.destroy());
    proxy.on('error', () => {
      if (res.destroyed) return;
      if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ error: '実行環境へ接続できません。学習モードを確認してください。' }),
      );
    });
    req.pipe(proxy);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  try {
    const requested = decodeURIComponent(new URL(req.url ?? '/', ORIGIN).pathname);
    if (
      requested.includes('\0') ||
      requested.includes('\\') ||
      requested.split('/').includes('..')
    ) {
      res.writeHead(400).end();
      return;
    }
    let file = path.join(root, requested);
    if (!file.startsWith(`${root}/`) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) file = path.join(root, 'index.html');
    } catch {
      if (path.extname(file)) {
        res.writeHead(404).end();
        return;
      }
      file = path.join(root, 'index.html');
    }
    const data = await readFile(file);
    res.setHeader('content-type', mime[path.extname(file)] ?? 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(500).end();
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(4173, '0.0.0.0');
