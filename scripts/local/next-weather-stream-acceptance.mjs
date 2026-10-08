import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { join } from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { ORIGIN } from './protocol.mjs';
import { nextWorkspace } from './next-project-protocol.mjs';
import { TRANSPORT_ROOT, previewBase, previewOrigin } from './preview-contract.mjs';

// 作者/CI専用。Preview container内で、実RSCの途中に反映・停止を行う。
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  assert.ok(size <= 128 * 1024);
  chunks.push(chunk);
}
const fixtures = JSON.parse(Buffer.concat(chunks).toString());
const solution = fixtures.find(({ id }) => id === 'solution');
assert.ok(solution);
const workspace = 'next-ch03-l02-e01';
const path = `/api/workspaces/${workspace}`;
let token;
let saved;
let run;
const identity = () => ({
  runId: run.runId,
  expectedSourceRevision: saved.sourceRevision,
  expectedSourceHash: saved.sourceHash,
});

function api(path, input = {}) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(input));
    const req = request(
      {
        hostname: 'web',
        port: 4173,
        path,
        method: 'POST',
        headers: {
          host: '127.0.0.1:4173',
          origin: ORIGIN,
          'content-type': 'application/json',
          'content-length': body.length,
          ...(token ? { 'x-tsumucode-token': token } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            value: JSON.parse(Buffer.concat(chunks).toString()),
          }),
        );
      },
    );
    req.setTimeout(15000, () => req.destroy(new Error('API deadline')));
    req.on('error', reject);
    req.end(body);
  });
}

async function save(files) {
  const reply = await api(`${path}/source`, {
    expectedSourceRevision: saved?.sourceRevision ?? 0,
    files,
  });
  assert.equal(reply.status, 200, JSON.stringify(reply.value));
  saved = reply.value;
}

async function start() {
  const reply = await api(`${path}/start`, { expectedSourceRevision: saved.sourceRevision });
  assert.equal(reply.status, 202, JSON.stringify(reply.value));
  run = reply.value;
  for (let attempt = 0; attempt < 100; attempt++) {
    saved = (await api(path)).value;
    run = saved.lastRun;
    if (run.state === 'ready') return;
    assert.notEqual(run.state, 'failed', JSON.stringify(run));
    await delay(200);
  }
  assert.fail('Ready deadline');
}

/** 作者だけが固定内部HTTPを操作し、exec前のreadyで旧Nextを再起動しないことを確認する。 */
function control(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: join(TRANSPORT_ROOT, run.runId, 'http.sock'),
        method: 'GET',
        path,
        headers,
      },
      (res) => {
        const chunks = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 1024) res.destroy(new Error('Control response limit'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode, value: JSON.parse(Buffer.concat(chunks).toString()) }),
        );
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('Control deadline')), 10000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });
}

function slowStream() {
  let observed;
  let failed;
  let finish;
  const started = new Promise((resolve, reject) => {
    observed = resolve;
    failed = reject;
  });
  const finished = new Promise((resolve) => {
    finish = resolve;
  });
  const body = [];
  const tree = encodeURIComponent(
    JSON.stringify(['', { children: ['__PAGE__', {}, null, null, 4096] }, null, null, 4112]),
  );
  // 固定Next16.3.8の4ヘッダーから生成する96bit query。任意tokenのredirectを検証に使わない。
  const key = createHash('sha256')
    .update(['0', '0', tree, '/'].join(','))
    .digest()
    .subarray(0, 12)
    .toString('base64url');
  const req = request(
    {
      hostname: '127.0.0.1',
      port: 4175,
      path: `${previewBase(workspace, run.runId)}weather/slow?_rsc=${key}`,
      headers: {
        host: previewOrigin(run.runId).slice('http://'.length),
        rsc: '1',
        'next-router-state-tree': tree,
        'next-url': '/',
      },
    },
    (res) => {
      res.on('data', (chunk) => {
        body.push(chunk);
        const text = Buffer.concat(body).toString();
        observed({ status: res.statusCode, type: res.headers['content-type'], text });
      });
      res.on('end', () => {
        failed(new Error(`RSC completed before cancellation: ${res.statusCode}`));
        finish({ complete: true, body: Buffer.concat(body).toString() });
      });
      const aborted = () => {
        failed(new Error('RSC aborted before loading'));
        finish({ complete: false, body: Buffer.concat(body).toString() });
      };
      res.on('aborted', aborted);
      res.on('error', aborted);
    },
  );
  const timer = setTimeout(() => req.destroy(new Error('Stream deadline')), 4000);
  req.on('close', () => clearTimeout(timer));
  req.on('error', (error) => {
    failed(error);
    finish({ complete: false, body: Buffer.concat(body).toString() });
  });
  req.end();
  return { started, finished };
}

try {
  token = (await api('/api/session')).value.token;
  saved = (await api(path)).value;
  if (['starting', 'ready', 'applying'].includes(saved.lastRun?.state))
    assert.equal((await api(`${path}/stop`, { runId: saved.lastRun.runId })).status, 200);
  await save(solution.files);
  await start();
  // 変更しないSourceも新しい反映markerで再開できる。古いmarkerだけでは再開しない。
  const sameSource = await api(`${path}/apply`, identity());
  assert.equal(sameSource.status, 200, JSON.stringify(sameSource.value));
  saved = sameSource.value;
  run = saved.lastRun;
  assert.equal(
    (await control('/__tsumucode_pause', { 'x-tsumucode-apply-id': randomUUID() })).status,
    200,
  );
  const pendingReady = await Promise.all([
    control('/__tsumucode_ready'),
    control('/__tsumucode_ready'),
  ]);
  assert.deepEqual(
    pendingReady.map(({ status }) => status),
    [503, 503],
  );
  assert.equal((await api(`${path}/stop`, { runId: run.runId })).status, 200);
  run = undefined;
  const pausedSource = (await api(path)).value;
  assert.equal(pausedSource.sourceHash, saved.sourceHash);
  assert.deepEqual(pausedSource.files, saved.files);
  await start();
  const previous = identity();
  const changing = slowStream();
  const waiting = await changing.started;
  assert.equal(waiting.status, 200);
  assert.ok(waiting.type.startsWith('text/x-component'));
  assert.equal(waiting.text.includes('遅延後の晴れ'), false);
  const page = 'app/weather/[state]/page.tsx';
  await save({ ...solution.files, [page]: solution.files[page] + '\n' });
  const applying = api(`${path}/apply`, identity());
  assert.equal((await changing.finished).complete, false);
  const applied = await applying;
  assert.equal(applied.status, 200, JSON.stringify(applied.value));
  saved = applied.value;
  run = saved.lastRun;
  assert.equal((await api(`${path}/grade`, previous)).status, 409);
  const current = await api(`${path}/grade`, identity());
  assert.equal(current.value.status, 'pass', JSON.stringify(current.value));

  const stopping = slowStream();
  const pending = await stopping.started;
  assert.equal(pending.status, 200);
  assert.ok(pending.type.startsWith('text/x-component'));
  assert.equal(pending.text.includes('遅延後の晴れ'), false);
  const before = saved;
  assert.equal((await api(`${path}/stop`, { runId: run.runId })).status, 200);
  assert.equal((await stopping.finished).complete, false);
  run = undefined;
  saved = (await api(path)).value;
  assert.deepEqual(saved.files, before.files);
  assert.equal(saved.sourceHash, before.sourceHash);
  await start();
  const restarted = await api(`${path}/grade`, identity());
  assert.equal(restarted.value.status, 'pass', JSON.stringify(restarted.value));
  assert.equal((await api(`${path}/stop`, { runId: run.runId })).status, 200);
  run = undefined;
  await save(nextWorkspace(workspace).files);
  console.log(
    JSON.stringify({
      passed: [
        '同じSourceの再反映',
        'pause後の並行readyは旧markerで再開しない',
        'pause中の停止・Source保持・再起動',
        '実RSCの結果到着前にSource反映・切断',
        '旧版grade409',
        '新保存版pass',
        '実RSC途中で停止・切断',
        'Source保持・再起動pass',
      ],
    }),
  );
} finally {
  if (run) await api(`${path}/stop`, { runId: run.runId }).catch(() => {});
}
