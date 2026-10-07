import { createServer, request } from 'node:http';
import { fork } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';
import { STARTER_FILES } from './project-protocol.mjs';

// Docker APIだけをdoubleにし、実controllerのHTTPとrun lifecycleを通す。learner実測ではない。
let created = 0;
let pauseImage = false;
let heldImage;
let imageRequested;
const owned = new Map();
const removed = [];
const engine = createServer((req, res) => {
  req.resume();
  const url = req.url;
  if (url.includes('/images/')) {
    if (pauseImage) {
      heldImage = res;
      imageRequested();
      return;
    }
    return res.end('{"Id":"fixed-test-image"}');
  }
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
  execArgv: [],
  env: {
    ...process.env,
    TSUMUCODE_LOCAL_OWNER: 'log-fault-test',
    TSUMUCODE_LOCAL_PROJECT_IMAGE: 'tsumucode-learning-fault-project:local',
  },
  stdio: 'pipe',
});
const exited = new Promise((resolve) => child.once('exit', resolve));
const web = fork('/checks/web.mjs', [], { execArgv: [], stdio: 'pipe' });
const webExited = new Promise((resolve) => web.once('exit', resolve));
let token;
/** fixture内の実web→実controllerへ、正規Host/Originで接続する。 */
function api(path, body = {}, onRequest) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 4173,
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
    onRequest?.(req);
    req.end(JSON.stringify(body));
  });
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      const session = await api('session');
      if (session.status === 200 && typeof session.value.token === 'string') {
        token = session.value.token;
        break;
      }
    } catch {
      // 起動前の接続拒否だけを待ち、tokenが実際に返るまで成功としない。
    }
    await delay(50);
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
  /** 実proxy timeoutと早いクライアント切断の両方で、未通知runを作らない。 */
  async function disconnectedStart(id, disconnectClient) {
    const route = `workspaces/${id}`;
    assert.equal(
      (
        await api(`${route}/source`, {
          expectedSourceRevision: 0,
          files: STARTER_FILES,
        })
      ).status,
      200,
    );
    const beforeDisconnect = created;
    const paused = new Promise((resolve) => {
      imageRequested = resolve;
    });
    pauseImage = true;
    let client;
    const started = Date.now();
    const pending = api(`${route}/start`, { expectedSourceRevision: 1 }, (req) => {
      client = req;
    }).catch(() => ({ status: 0 }));
    await paused;
    if (disconnectClient) client.destroy();
    // timeout側は実webの15秒をそのまま使う。controllerの保留は20秒以内に解除する。
    assert.equal((await pending).status, disconnectClient ? 0 : 503);
    const elapsed = Date.now() - started;
    assert.ok(disconnectClient ? elapsed < 5000 : elapsed >= 14000 && elapsed < 20000);
    let stopping = false;
    for (let i = 0; i < 100; i++) {
      const status = await api(route);
      if (status.value.lastRun?.state === 'stopping') {
        stopping = true;
        break;
      }
      await delay(10);
    }
    assert.equal(stopping, true);
    pauseImage = false;
    heldImage.end('{"Id":"fixed-test-image"}');
    heldImage = undefined;
    let stopped;
    for (let i = 0; i < 100; i++) {
      const status = await api(route);
      if (status.value.lastRun?.state === 'stopped') {
        stopped = status.value;
        break;
      }
      await delay(10);
    }
    assert.equal(stopped?.lastRun.reason, 'client-disconnected');
    assert.deepEqual(stopped.files, STARTER_FILES);
    assert.equal(created, beforeDisconnect);
    return elapsed;
  }
  const proxyTimeoutMs = await disconnectedStart('disconnect-check', false);
  const browserDisconnectMs = await disconnectedStart('browser-disconnect-check', true);
  assert.equal((await run('after-disconnect')).result.status, 'succeeded');
  // 準備中のAPIを保留してSIGTERMを送り、回収後のcreateを防ぐHTTP境界の回帰。
  const beforeShutdown = created;
  const paused = new Promise((resolve) => {
    imageRequested = resolve;
  });
  pauseImage = true;
  const pending = api('runs', {
    apiVersion: 1,
    exerciseId: 'javascript-ch03-l05-e01',
    contentRevision: revision,
    runtimeProfileId: 'node-closure-v1',
    runId: 'shutdown-pending',
    exerciseSessionId: 'fault-session',
    executionRevision: 2,
    files: { 'script.js': '', 'index.html': '', 'styles.css': '' },
  }).catch(() => ({ status: 503 }));
  await paused;
  const lateBody = JSON.stringify({
    apiVersion: 1,
    exerciseId: 'javascript-ch03-l05-e01',
    contentRevision: revision,
    runtimeProfileId: 'node-closure-v1',
    runId: 'shutdown-late-body',
    exerciseSessionId: 'fault-session',
    executionRevision: 3,
    files: { 'script.js': '', 'index.html': '', 'styles.css': '' },
  });
  let lateRequest;
  const lateResponse = new Promise((resolve, reject) => {
    lateRequest = request(
      {
        hostname: '127.0.0.1',
        port: 4174,
        path: '/api/runs',
        method: 'POST',
        headers: {
          host: '127.0.0.1:4173',
          origin: 'http://127.0.0.1:4173',
          'content-type': 'application/json',
          'content-length': lateBody.length,
          'x-tsumucode-token': token,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    lateRequest.on('error', reject);
    lateRequest.write(lateBody.slice(0, 1));
  }).catch(() => 503);
  await delay(50);
  child.kill('SIGTERM');
  await delay(50);
  lateRequest.end(lateBody.slice(1));
  assert.equal(await lateResponse, 503);
  heldImage.end('{}');
  heldImage = undefined;
  assert.equal((await pending).status, 503);
  await exited;
  assert.equal(created, beforeShutdown);
  assert.deepEqual([...owned.keys()], []);
  console.log(
    JSON.stringify({
      proof: 'real controller with Docker HTTP double; not learner evidence',
      failedStatus: failed.result.status,
      elapsedMs: failed.elapsed,
      nextStatus: recovered.result.status,
      preparationShutdownNoCreate: true,
      shutdownLateBodyRejected: true,
      residentProxyDisconnectedNoCreate: true,
      browserDisconnectedNoCreate: true,
      browserDisconnectMs,
      proxyTimeoutMs,
      removed,
    }),
  );
} finally {
  heldImage?.end('{}');
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await exited;
  if (web.exitCode === null && web.signalCode === null) web.kill('SIGTERM');
  await webExited;
  engine.closeAllConnections();
  await new Promise((r) => engine.close(r));
}
