import { createServer, request } from 'node:http';
import { fork } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';

// Docker APIだけをdoubleにし、実controllerのHTTPとrun lifecycleを通す。learner実測ではない。
let created = 0;
const owned = new Map();
const removed = [];
const engine = createServer((req, res) => {
  req.resume();
  const url = req.url;
  if (url.includes('/images/')) return res.end('{}');
  if (url.startsWith('/v1.47/containers/json'))
    return res.end(JSON.stringify([...owned.keys()].map((Id) => ({ Id }))));
  if (url === '/v1.47/containers/create') {
    const Id = `fake-${++created}`;
    owned.set(Id, true);
    return res.end(JSON.stringify({ Id }));
  }
  const id = url.split('?')[0].split('/')[3];
  if (url.includes('/logs?')) {
    res.writeHead(200);
    res.flushHeaders();
    if (id !== 'fake-1') res.end();
    return;
  }
  if (url.includes('/wait?')) return res.end('{"StatusCode":0}');
  if (url.endsWith('/json')) return res.end('{"State":{"OOMKilled":false}}');
  if (req.method === 'DELETE') {
    owned.delete(id);
    removed.push(id);
    res.writeHead(204).end();
    return;
  }
  res.writeHead(204).end();
});
await new Promise((r) => engine.listen('/var/run/docker.sock', r));
const child = fork('/app/controller.mjs', [], {
  env: { ...process.env, TSUMUCODE_LOCAL_OWNER: 'log-fault-test' },
  stdio: 'pipe',
});
let token;
/** fixture container内の本物のcontroller APIへ、正規Host/Originで接続する。 */
function api(path, body = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 4174,
        path: `/api/${path}`,
        method: 'POST',
        headers: {
          host: '127.0.0.1:4173',
          origin: 'http://127.0.0.1:4173',
          'content-type': 'application/json',
          ...(token ? { 'x-tsumucode-token': token } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, value: JSON.parse(data) }));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      token = (await api('session')).value.token;
      break;
    } catch {
      await delay(50);
    }
  }
  assert.ok(token);
  const revision = JSON.parse(await readFile('/app/course-index.json', 'utf8')).revision;
  /** 21秒内に結果が確定しなければ、active未解放として失敗させる。 */
  async function run(id) {
    const started = Date.now();
    const response = await api('runs', {
      apiVersion: 1,
      exerciseId: 'javascript-ch03-l05-e01',
      contentRevision: revision,
      runtimeProfileId: 'node-closure-v1',
      runId: id,
      exerciseSessionId: 'fault-session',
      executionRevision: 1,
      files: { 'script.js': 'console.log(10)', 'index.html': '', 'styles.css': '' },
    });
    assert.equal(response.status, 202);
    for (let i = 0; i < 210; i++) {
      const result = (await api(`runs/${id}`)).value;
      if (result.state === 'completed')
        return { result: result.result, elapsed: Date.now() - started };
      await delay(100);
    }
    throw Error('controller run remained active');
  }
  const failed = await run('fault-run');
  assert.equal(failed.result.status, 'system-error');
  assert.ok(failed.elapsed < 20000);
  assert.deepEqual([...owned.keys()], []);
  const recovered = await run('after-fault');
  assert.equal(recovered.result.status, 'succeeded');
  assert.deepEqual([...owned.keys()], []);
  console.log(
    JSON.stringify({
      proof: 'real controller with Docker HTTP double; not learner evidence',
      failedStatus: failed.result.status,
      elapsedMs: failed.elapsed,
      nextStatus: recovered.result.status,
      removed,
    }),
  );
} finally {
  child.kill('SIGTERM');
  await new Promise((r) => child.once('exit', r));
  engine.closeAllConnections();
  await new Promise((r) => engine.close(r));
}
