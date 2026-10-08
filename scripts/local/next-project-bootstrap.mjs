import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { mkdir, readFile, writeFile, symlink, chmod, rm, readdir, statfs } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { nextWorkspace } from './next-project-protocol.mjs';
import { nextDataBackend } from './next-data-backend.mjs';

// 固定設定・依存だけで起動する。編集可能なserver moduleも非rootの同じ隔離内で実行する。
const { files, metadata, preview } = JSON.parse(
  Buffer.from(process.argv.slice(2).join(''), 'base64').toString('utf8'),
);
const root = '/opt/workspace';
const base = preview ? `/w/${metadata.workspaceId}/${metadata.runId}` : '';
const goal = nextWorkspace(metadata.workspaceId).goal;
const controlledData = ['data-cache-revalidation', 'loading-error-not-found'].includes(goal);
const nextPort = controlledData ? 5175 : 5174;
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
  ${controlledData ? 'experimental: { turbopackFileSystemCacheForDev: false, devValidationWorker: false, reactDebugChannel: false },' : ''}
};
`,
);
await writeFile('/tmp/applied.json', JSON.stringify(metadata), { flag: 'wx', mode: 0o600 });

let child;
let active;
let updating;
let stopping = false;
let dataBackend;
let paused;

if (controlledData) {
  // 固定APIは同じ隔離のloopbackで処理し、Nextの追加compileを避ける。
  const backend = createServer((req, res) => {
    if (!dataBackend?.handle(req, res)) res.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    backend.once('error', reject);
    backend.listen(5174, '127.0.0.1', resolve);
  });
}

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
    if (paused) {
      const pause = paused;
      await pause.stopped;
      if (JSON.parse(desired).applyId !== pause.applyId) throw new Error('Next apply pending');
      paused = undefined;
    }
    if (desired === active && child) return JSON.parse(active);
    dataBackend?.retire();
    await stopChild();
    if (controlledData) dataBackend = await nextDataBackend(metadata.workspaceId, base);
    // 新教材では保存版ごとに制御データとfetch cacheを同じ初期条件へ戻す。
    if (controlledData) await rm(`${root}/.next`, { recursive: true, force: true });
    if (stopping) throw new Error('Next is stopping');
    child = spawn(
      process.execPath,
      [
        '/opt/next/node_modules/next/dist/bin/next',
        'dev',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(nextPort),
      ],
      {
        cwd: root,
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          HOME: root,
          LANG: 'C.UTF-8',
          NEXT_TELEMETRY_DISABLED: '1',
          ...(controlledData
            ? {
                TSUMUCODE_NEXT_BASE_PATH: base,
                NODE_OPTIONS: '--max-old-space-size=192',
                MALLOC_ARENA_MAX: '2',
                RAYON_NUM_THREADS: '1',
                TOKIO_WORKER_THREADS: '1',
              }
            : {}),
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
            `http://127.0.0.1:${nextPort}${page === '' ? base || '/' : base + '/' + page}`,
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
        if (goal === 'loading-error-not-found') {
          // warmupで初回失敗を消費しても、学習者の最初の操作は失敗から始める。
          const reset = await globalThis.fetch(
            `http://127.0.0.1:5174${base}/api/weather?control=reset`,
            {
              signal: globalThis.AbortSignal.timeout(2000),
            },
          );
          if (reset.status !== 200 || (await reset.json()).reset !== true)
            throw new Error('Weather reset failed');
        }
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

/** 固定隔離の資源だけを読む。作者計測のために追加Node processを起動しない。 */
async function resources() {
  const value = async (name) => Number((await readFile(`/sys/fs/cgroup/${name}`, 'utf8')).trim());
  const usage = async (path) => {
    const stat = await statfs(path);
    return (stat.blocks - stat.bfree) * stat.bsize;
  };
  const states = await Promise.all(
    (await readdir('/proc'))
      .filter((name) => /^\d+$/u.test(name))
      .map(async (name) => {
        const stat = await readFile(`/proc/${name}/stat`, 'utf8').catch((error) => {
          if (error.code !== 'ENOENT') throw error;
          return '';
        });
        return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z');
      }),
  );
  const events = Object.fromEntries(
    (await readFile('/sys/fs/cgroup/memory.events', 'utf8'))
      .trim()
      .split('\n')
      .map((line) => line.split(' ')),
  );
  return {
    zombies: states.filter(Boolean).length,
    memoryPeak: await value('memory.peak'),
    memoryCurrent: await value('memory.current'),
    memoryEvents: {
      max: Number(events.max),
      oom: Number(events.oom),
      oomKill: Number(events.oom_kill),
    },
    pids: await value('pids.current'),
    workspaceBytes: await usage(root),
    temporaryBytes: await usage('/tmp'),
  };
}

function handle(req, res) {
  if (controlledData && req.url === '/__tsumucode_resources' && req.method === 'GET') {
    void resources().then(
      (observed) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(observed));
      },
      () => res.writeHead(503).end('{}'),
    );
    return;
  }
  if (controlledData && req.url === '/__tsumucode_pause' && req.method === 'GET') {
    const applyId = req.headers['x-tsumucode-apply-id'];
    if (
      updating ||
      paused ||
      stopping ||
      !active ||
      typeof applyId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(applyId)
    ) {
      res.writeHead(409).end('{}');
      return;
    }
    const previous = active;
    active = undefined;
    dataBackend?.retire();
    paused = { applyId, stopped: stopChild() };
    void paused.stopped.then(
      () => {
        res.setHeader('content-type', 'application/json');
        res.end(previous);
      },
      () => res.writeHead(503).end('{}'),
    );
    return;
  }
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
  if (dataBackend?.handle(req, res)) return;
  if (!active || !child) {
    res.writeHead(503).end();
    return;
  }
  const proxy = request(
    {
      host: '127.0.0.1',
      port: nextPort,
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
    port: nextPort,
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
    dataBackend?.retire();
    void stopChild().finally(() => process.exit());
  });
}
