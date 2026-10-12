import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { fork } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { setTimeout as delay } from 'node:timers/promises';

// Docker応答だけを故障Fixtureにし、実controllerのHTTP切断と遅延応答を通す。
// 本物の学習processの実測はpython-practice-acceptance.mjsが担当する。
const containers = new Map();
const held = [];
let mode;
let reached;
let created = 0;
let writes = 0;
let starts = 0;
let token;
function hold(res, value, status = 200) {
  held.push(() => res.writeHead(status).end(JSON.stringify(value)));
  reached();
}
const engine = createServer(async (req, res) => {
  const url = req.url;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (url.includes('/images/')) {
    if (mode === 'ready') return hold(res, { Id: 'fixed-fault-image' });
    return res.end('{"Id":"fixed-fault-image"}');
  }
  if (url.startsWith('/v1.47/containers/json'))
    return res.end(JSON.stringify([...containers.keys()].map((Id) => ({ Id }))));
  if (url === '/v1.47/containers/create') {
    const config = JSON.parse(Buffer.concat(chunks).toString());
    const Id = `practice-fault-${++created}`;
    containers.set(Id, {
      config,
      State: { Running: false, Paused: false, OOMKilled: false },
      waits: [],
    });
    if (mode === 'create' && config.Labels['app.tsumucode.run']) return hold(res, { Id });
    return res.end(JSON.stringify({ Id }));
  }
  const id = url.split('?')[0].split('/')[3];
  const container = containers.get(id);
  if (!container) return res.writeHead(404).end('{}');
  if (url.includes('/logs?')) {
    res.writeHead(200).flushHeaders();
    if (!container.config.Labels['app.tsumucode.run']) return res.end();
    container.logs = res;
    const data = Buffer.from(
      `TSUMUCODE_INPUT ${JSON.stringify({ type: 'request-input', runId: container.config.Labels['app.tsumucode.run'], sequence: 1 })}\n`,
    );
    const header = Buffer.alloc(8);
    header[0] = 2;
    header.writeUInt32BE(data.length, 4);
    res.write(Buffer.concat([header, data]));
    return;
  }
  if (url.includes('/wait?')) {
    if (!container.config.Labels['app.tsumucode.run']) {
      if (mode === 'analysis') return hold(res, { StatusCode: 137 });
      return res.end('{"StatusCode":0}');
    }
    container.waits.push(res);
    return;
  }
  if (url.endsWith('/start')) {
    starts += 1;
    container.State.Running = true;
  } else if (url.endsWith('/pause')) container.State.Paused = true;
  else if (url.endsWith('/unpause')) {
    container.State.Paused = false;
    container.resumed = true;
    if (mode === 'unpause') return hold(res, undefined, 204);
  } else if (url.endsWith('/json')) {
    if (mode === 'resume-inspect' && container.resumed)
      return hold(res, { State: { ...container.State } });
    return res.end(JSON.stringify({ State: container.State }));
  } else if (req.method === 'DELETE' || url.endsWith('/kill')) {
    if (mode === 'attach-error') await delay(20);
    container.State.Running = false;
    container.State.Paused = false;
    container.logs?.end();
    container.stdin?.destroy();
    for (const waiting of container.waits) waiting.end('{"StatusCode":137}');
    if (req.method === 'DELETE') containers.delete(id);
  }
  res.writeHead(204).end();
});
engine.on('upgrade', (req, socket) => {
  const id = req.url.split('?')[0].split('/')[3];
  const container = containers.get(id);
  assert.ok(container);
  if (mode === 'attach-error') {
    socket.end('HTTP/1.1 500 Internal Server Error\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}');
    return;
  }
  container.stdin = socket;
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    writes += chunk.length;
  });
  socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n');
});
await new Promise((resolve) => engine.listen('/var/run/docker.sock', resolve));
const child = fork('/app/controller.mjs', [], {
  execArgv: [],
  env: { ...process.env, TSUMUCODE_LOCAL_OWNER: 'practice-http-fault' },
  stdio: 'pipe',
});
const exited = new Promise((resolve) => child.once('exit', resolve));
let childError = '';
child.stderr.on('data', (chunk) => {
  childError += chunk;
});
function api(path, body = {}, capture) {
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
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, value: JSON.parse(data) }));
      },
    );
    req.on('error', reject);
    capture?.(req);
    req.end(JSON.stringify(body));
  });
}
const revision = JSON.parse(await readFile('/app/python-course-index.json', 'utf8')).revision;
const input = (module) => ({
  apiVersion: 1,
  exerciseId: module ? 'python-basics-ch01-l08-e01' : 'python-basics-ch01-l02-e01',
  contentRevision: revision,
  runtimeProfileId: 'cpython-values-v1',
  exerciseSessionId: 'fault-session',
  executionRevision: 1,
  files: module
    ? {
        'main.py': 'from lesson_tools import add\nprint(add(3, 5))\nprint(add(4, 6))\n',
        'lesson_tools.py': 'def add(left, right):\n    return left + right\n',
      }
    : { 'main.py': 'name = input()\nprint(name)\n' },
});
async function freeSlot() {
  for (let index = 0; index < 100; index += 1) {
    const response = await api('python-capabilities');
    if (response.status === 200 && containers.size === 0) return;
    await delay(10);
  }
  throw new Error('fault cleanup did not settle');
}
try {
  for (let index = 0; index < 100; index += 1) {
    try {
      token = (await api('session')).value.token;
      break;
    } catch {
      await delay(20);
    }
  }
  assert.ok(token, childError);
  for (const stage of ['ready', 'analysis', 'create']) {
    const beforeStarts = starts;
    const beforeCreates = created;
    let client;
    const signal = new Promise((resolve) => {
      reached = resolve;
    });
    mode = stage;
    const pending = api('practice/runs', input(stage === 'analysis'), (req) => {
      client = req;
    }).catch(() => ({ status: 0 }));
    await signal;
    client.destroy();
    assert.equal((await pending).status, 0);
    await delay(50);
    assert.equal((await api('practice/runs', input(false))).status, 409);
    mode = undefined;
    held.splice(0).forEach((release) => release());
    await freeSlot();
    assert.equal(starts - beforeStarts, stage === 'analysis' ? 1 : 0);
    assert.equal(created - beforeCreates, stage === 'ready' ? 0 : 1);
    assert.equal(containers.size, 0);
  }
  for (const stage of ['unpause', 'resume-inspect']) {
    const createdRun = await api('practice/runs', input(false));
    assert.equal(createdRun.status, 202);
    const identity = createdRun.value.identity;
    let snapshot;
    for (let index = 0; index < 100; index += 1) {
      snapshot = await api(`practice/runs/${identity.runId}`, { identity });
      if (snapshot.value.phase === 'waiting-input') break;
      await delay(10);
    }
    assert.equal(snapshot.value.phase, 'waiting-input');
    // 202と通常pollの正常finishでは取消されず、入力待機が維持される。
    assert.equal(snapshot.value.reason, null);
    let client;
    const signal = new Promise((resolve) => {
      reached = resolve;
    });
    mode = stage;
    const beforeWrites = writes;
    const pending = api(
      `practice/runs/${identity.runId}/input`,
      { identity, sequence: 1, line: '故障Fixture入力' },
      (req) => {
        client = req;
      },
    ).catch(() => ({ status: 0 }));
    await signal;
    client.destroy();
    assert.equal((await pending).status, 0);
    await delay(50);
    mode = undefined;
    held.splice(0).forEach((release) => release());
    await freeSlot();
    const ended = await api(`practice/runs/${identity.runId}`, { identity });
    assert.equal(ended.value.reason, 'client-disconnected');
    assert.equal(ended.value.removed, true);
    assert.equal(writes, beforeWrites);
    assert.equal(
      (await api(`practice/runs/${identity.runId}/input`, { identity, sequence: 1, line: 'late' }))
        .status,
      409,
    );
    await api(`practice/runs/${identity.runId}/ack`, { identity });
  }
  mode = 'attach-error';
  const beforeStarts = starts;
  const failedRun = await api('practice/runs', input(false));
  assert.equal(failedRun.status, 202);
  assert.equal(failedRun.value.reason, 'system-error');
  assert.equal(failedRun.value.removed, true);
  assert.equal(failedRun.value.elapsedMs, 0);
  assert.equal(starts, beforeStarts);
  const acknowledged = await api(`practice/runs/${failedRun.value.identity.runId}/ack`, {
    identity: failedRun.value.identity,
  });
  assert.equal(acknowledged.status, 200);
  assert.deepEqual(acknowledged.value.identity, failedRun.value.identity);
  assert.equal(acknowledged.value.elapsedMs, 0);
  assert.equal(acknowledged.value.purged, true);
  mode = undefined;
  assert.equal(containers.size, 0);
  console.log(
    JSON.stringify({
      status: 'passed',
      fixture: 'real controller / synthetic Docker responses',
      checks: [
        'ready/analysis/create中のHTTP切断は遅延応答後もlearnerを開始しない',
        'unpause/inspect中のHTTP切断は遅延応答後もstdin書込み0・回収確認',
        '通常202/poll finishは取消せず、停止後入力は拒否',
        '起動前のstdin接続失敗はelapsedMs 0・同じidentityで回収済み結果をackする',
      ],
    }),
  );
} finally {
  mode = undefined;
  held.splice(0).forEach((release) => release());
  child.kill('SIGTERM');
  await exited;
  engine.closeAllConnections();
  await new Promise((resolve) => engine.close(resolve));
}
