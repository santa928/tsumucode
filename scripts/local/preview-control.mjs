import { createServer } from 'node:http';
import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CONTROL_SOCKET } from './preview-contract.mjs';

/** 管理handler/token/Sourceとは別listenerで、現在runの接続先だけを読む。 */
export async function startPreviewControl(current) {
  await mkdir(dirname(CONTROL_SOCKET), { recursive: true, mode: 0o750 });
  const stale = await lstat(CONTROL_SOCKET).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (stale) {
    if (!stale.isSocket() || stale.uid !== 0) throw new Error('Invalid control socket');
    await unlink(CONTROL_SOCKET);
  }
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    if (
      req.method !== 'GET' ||
      req.url !== '/active' ||
      req.headers['transfer-encoding'] ||
      Number(req.headers['content-length'] ?? 0) !== 0
    ) {
      res.writeHead(403).end('{}');
      return;
    }
    const target = current();
    res.writeHead(target ? 200 : 503).end(JSON.stringify(target ?? {}));
  });
  server.requestTimeout = 2000;
  server.headersTimeout = 2000;
  server.on('upgrade', (req, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(CONTROL_SOCKET, resolve);
  });
  await chmod(CONTROL_SOCKET, 0o660);
  return server;
}
