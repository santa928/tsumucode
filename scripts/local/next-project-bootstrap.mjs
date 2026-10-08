import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { mkdir, readFile, writeFile, symlink, chmod } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { nextWorkspace } from './next-project-protocol.mjs';

// 固定設定・依存だけで起動する。編集可能なserver moduleも非rootの同じ隔離内で実行する。
const { files, metadata, preview } = JSON.parse(
  Buffer.from(process.argv.slice(2).join(''), 'base64').toString('utf8'),
);
const root = '/opt/workspace';
const base = preview ? `/w/${metadata.workspaceId}/${metadata.runId}` : '';
for (const name of Object.keys(nextWorkspace(metadata.workspaceId).files)) {
  await mkdir(`${root}/${name.slice(0, name.lastIndexOf('/'))}`, { recursive: true });
  await writeFile(`${root}/${name}`, files[name], { flag: 'wx', mode: 0o600 });
}
await symlink('/opt/next/node_modules', `${root}/node_modules`);
for (const name of ['package.json', 'tsconfig.json']) {
  await writeFile(`${root}/${name}`, await readFile(`/opt/next/${name}`));
}
await writeFile(
  `${root}/next.config.mjs`,
  `export default {
  devIndicators: false,
  poweredByHeader: false,
  basePath: ${JSON.stringify(base)},
  allowedDevOrigins: [${JSON.stringify(`${metadata.runId}.localhost`)}],
  turbopack: { root: '/opt' },
};
`,
);
await writeFile('/tmp/applied.json', JSON.stringify(metadata), { flag: 'wx', mode: 0o600 });

let child;
let active;
let updating;
let stopping = false;

async function stopChild() {
  const previous = child;
  child = undefined;
  if (!previous || previous.exitCode !== null || previous.signalCode !== null) return;
  const ended = once(previous, 'exit');
  previous.kill('SIGTERM');
  const timer = setTimeout(() => previous.kill('SIGKILL'), 1000);
  try {
    await ended;
  } finally {
    clearTimeout(timer);
  }
}

/** 反映後は新processでcompileし、旧module cacheを新保存版のreadyに使わない。 */
function ensureLatest() {
  if (updating) return updating;
  updating = (async () => {
    const desired = await readFile('/tmp/applied.json', 'utf8');
    if (desired === active && child) return JSON.parse(active);
    await stopChild();
    if (stopping) throw new Error('Next is stopping');
    child = spawn(
      process.execPath,
      [
        '/opt/next/node_modules/next/dist/bin/next',
        'dev',
        '--hostname',
        '127.0.0.1',
        '--port',
        '5174',
      ],
      {
        cwd: root,
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          HOME: root,
          LANG: 'C.UTF-8',
          NEXT_TELEMETRY_DISABLED: '1',
        },
        stdio: ['ignore', 'inherit', 'inherit'],
      },
    );
    const current = child;
    current.once('exit', () => {
      if (child === current && !stopping) process.exit(1);
    });
    current.once('error', () => process.exit(1));
    const deadline = Date.now() + 15000;
    while (
      !stopping &&
      Date.now() < deadline &&
      current.exitCode === null &&
      current.signalCode === null
    ) {
      try {
        // 構文エラーの500も実serverの応答として扱い、採点側でcode-errorにする。
        for (const page of nextWorkspace(metadata.workspaceId).pages) {
          const reply = await globalThis.fetch(
            `http://127.0.0.1:5174${page === '' ? base || '/' : base + '/' + page}`,
            {
              signal: globalThis.AbortSignal.timeout(2000),
              redirect: 'manual',
            },
          );
          await reply.arrayBuffer();
          if (reply.status >= 300 && reply.status < 400) throw new Error('Next redirect denied');
        }
        if ((await readFile('/tmp/applied.json', 'utf8')) !== desired)
          throw new Error('Source changed');
        active = desired;
        return JSON.parse(active);
      } catch {
        await delay(100);
      }
    }
    throw new Error('Next HTTP readiness failed');
  })().finally(() => {
    updating = undefined;
  });
  return updating;
}

function handle(req, res) {
  if (req.url === '/__tsumucode_ready' && req.method === 'GET') {
    void ensureLatest().then(
      (current) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(current));
      },
      () => res.writeHead(503).end('{}'),
    );
    return;
  }
  if (!active || !child) {
    res.writeHead(503).end();
    return;
  }
  const proxy = request(
    {
      host: '127.0.0.1',
      port: 5174,
      method: req.method,
      path: base && req.url === `${base}/` ? base : req.url,
      headers: req.headers,
    },
    (reply) => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    },
  );
  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(503);
    res.end();
  });
  req.pipe(proxy);
  res.once('close', () => proxy.destroy());
}

function upgrade(req, client, head) {
  const proxy = request({
    host: '127.0.0.1',
    port: 5174,
    method: 'GET',
    path: req.url,
    headers: req.headers,
  });
  proxy.on('error', () => client.destroy());
  proxy.on('response', () => client.destroy());
  proxy.on('upgrade', (reply, socket, pending) => {
    const headers = Object.entries(reply.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
    client.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n\r\n`);
    if (head.length) socket.write(head);
    if (pending.length) client.write(pending);
    socket.on('error', () => client.destroy());
    client.on('error', () => socket.destroy());
    client.once('close', () => socket.destroy());
    socket.once('close', () => client.destroy());
    client.pipe(socket).pipe(client);
  });
  client.once('close', () => proxy.destroy());
  proxy.end();
}

const server = createServer(handle);
server.on('upgrade', upgrade);
server.listen(5173, '127.0.0.1');
if (preview) {
  const transport = createServer(handle);
  transport.on('upgrade', upgrade);
  await new Promise((resolve, reject) => {
    transport.once('error', reject);
    transport.listen('/transport/http.sock', resolve);
  });
  await chmod('/transport/http.sock', 0o660);
}
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    stopping = true;
    void stopChild().finally(() => process.exit());
  });
}
