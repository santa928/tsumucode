import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { ORIGIN } from './protocol.mjs';
import { previewOrigin, previewBase } from './preview-contract.mjs';

// 作者/CI専用。実Proxyで資格情報・容量・採点競合・反映と停止の中断を検証する。
const chunks = [];
let bytes = 0;
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  assert.ok(bytes <= 128 * 1024);
  chunks.push(chunk);
}
const fixtures = JSON.parse(Buffer.concat(chunks).toString());
const solution = fixtures.find(({ id }) => id === 'solution').files;
const workspace = 'next-ch04-l01-e01';
const path = `/api/workspaces/${workspace}`;
const route = 'app/api/note/route.ts';
let saved;
let run;
let token;
const passed = [];
function api(url, value = {}) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(value));
    const req = request(
      {
        hostname: 'web',
        port: 4173,
        path: url,
        method: 'POST',
        headers: {
          host: '127.0.0.1:4173',
          origin: ORIGIN,
          'content-type': 'application/json',
          ...(token ? { 'x-tsumucode-token': token } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('error', reject);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, value: JSON.parse(data) });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(15000, () => req.destroy(new Error('Form author API deadline')));
    req.on('error', reject);
    req.end(body);
  });
}
const identity = () => ({
  runId: run.runId,
  expectedSourceRevision: saved.sourceRevision,
  expectedSourceHash: saved.sourceHash,
});
async function apply(files) {
  const updated = await api(`${path}/source`, {
    expectedSourceRevision: saved.sourceRevision,
    files,
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.value));
  saved = updated.value;
  if (run) {
    const updatedRun = await api(`${path}/apply`, identity());
    assert.equal(updatedRun.status, 200, JSON.stringify(updatedRun.value));
    saved = updatedRun.value;
    run = saved.lastRun;
    return;
  }
  const started = await api(`${path}/start`, { expectedSourceRevision: saved.sourceRevision });
  assert.equal(started.status, 202, JSON.stringify(started.value));
  run = started.value;
  for (let i = 0; i < 100; i++) {
    saved = (await api(path)).value;
    run = saved.lastRun;
    if (run.state === 'ready') return;
    assert.notEqual(run.state, 'failed', JSON.stringify(run));
    await delay(200);
  }
  assert.fail('Form author readiness deadline');
}
function post(body = JSON.stringify({ input: '境界を確認するメモ' }), headers = {}, url) {
  return new Promise((resolve, reject) => {
    const origin = previewOrigin(run.runId);
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 4175,
        path: url ?? `${previewBase(workspace, run.runId)}api/note`,
        method: 'POST',
        headers: {
          host: new URL(origin).host,
          origin,
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-mode': 'cors',
          'sec-fetch-dest': 'empty',
          ...headers,
        },
      },
      (res) => {
        let bytes = 0;
        let text = '';
        let settled = false;
        const finish = (complete) => {
          if (settled) return;
          settled = true;
          resolve({ status: res.statusCode, bytes, text, complete });
        };
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (text.length < 4096) text += chunk.toString().slice(0, 4096 - text.length);
        });
        res.on('end', () => finish(true));
        res.on('error', () => finish(false));
        res.on('aborted', () => finish(false));
      },
    );
    req.setTimeout(40000, () => req.destroy(new Error('Form author Preview deadline')));
    req.on('error', reject);
    req.end(body);
  });
}
try {
  token = (await api('/api/session')).value.token;
  saved = (await api(path)).value;
  if (['starting', 'ready', 'applying'].includes(saved.lastRun?.state))
    assert.equal((await api(`${path}/stop`, { runId: saved.lastRun.runId })).status, 200);
  const inspect = `let calls = 0;
export async function POST(request: Request): Promise<Response> {
  calls++;
  await request.arrayBuffer();
  return Response.json({ calls, names: [...request.headers.keys()],
    host: request.headers.get('host'), origin: request.headers.get('origin'),
    forwarded: request.headers.get('forwarded'), forwardedHost: request.headers.get('x-forwarded-host') });
}
`;
  await apply({ ...solution, [route]: inspect });
  const reply = await post(undefined, {
    cookie: 'author-secret=blocked',
    authorization: 'Bearer author-blocked',
    'x-tsumucode-token': 'author-blocked',
    'x-tsumucode-note-lease': 'author-blocked',
    forwarded: 'host=other.invalid',
    'x-forwarded-host': 'other.invalid',
  });
  assert.equal(reply.status, 200);
  const observed = JSON.parse(reply.text);
  for (const name of ['cookie', 'authorization', 'x-tsumucode-token', 'x-tsumucode-note-lease'])
    assert.equal(observed.names.includes(name), false);
  assert.equal(observed.origin, previewOrigin(run.runId));
  assert.equal(observed.host, new URL(previewOrigin(run.runId)).host);
  assert.equal(observed.forwarded, null);
  assert.equal(observed.forwardedHost, observed.host);
  for (const origin of ['', 'null', 'http://other.invalid'])
    assert.equal((await post(undefined, { origin })).status, 403);
  assert.equal((await post(undefined, { host: 'other.localhost:4175' })).status, 403);
  for (const suffix of ['api/note?x=1', 'api/note-store', '__tsumucode_note', 'api/echo'])
    assert.equal(
      (await post(undefined, {}, previewBase(workspace, run.runId) + suffix)).status,
      403,
    );
  assert.equal((await post('x'.repeat(64 * 1024 + 1))).status, 413);
  assert.equal(JSON.parse((await post()).text).calls, 2, '拒否した要求を上流へ送らない');
  passed.push('Host/Origin/固定経路/資格情報非転送/本文64KiB全量受信');

  const slow = solution[route].replace(
    'const state = await storeNote(input);',
    'await new Promise((resolve) => setTimeout(resolve, 3500));\n  const state = await storeNote(input);',
  );
  await apply({ ...solution, [route]: slow });
  const pending = post();
  await delay(100);
  const busy = await api(`${path}/grade`, identity());
  assert.equal(busy.status, 409, JSON.stringify(busy.value));
  assert.equal((await api(path)).value.lastRun.state, 'ready');
  assert.equal((await pending).status, 503, '採点競合でも既存Preview送信を維持する');
  await apply(solution);
  const graded = await api(`${path}/grade`, identity());
  assert.equal(graded.status, 200, JSON.stringify(graded.value));
  assert.equal(graded.value.status, 'pass');
  passed.push('送信中採点409/run維持/送信完了後合格');

  await apply({
    ...solution,
    [route]: 'export function POST() { return new Response("x".repeat(512 * 1024 + 1)); }\n',
  });
  assert.equal((await post()).status, 502);
  await apply({ ...solution, [route]: slow.replace('3500', '35000') });
  const timed = await post();
  assert.equal(timed.status, 504);
  assert.equal(timed.complete, true);
  passed.push('応答512KiB/応答前30秒期限/上流中断');

  await apply({ ...solution, [route]: slow });
  const old = post();
  await delay(100);
  await apply(solution);
  assert.equal((await old).status, 503);
  await apply({ ...solution, [route]: slow });
  const stopped = post();
  await delay(100);
  const kept = saved;
  assert.equal((await api(`${path}/stop`, { runId: run.runId })).status, 200);
  run = undefined;
  assert.equal((await stopped).status, 503);
  saved = (await api(path)).value;
  assert.equal(saved.sourceHash, kept.sourceHash);
  assert.deepEqual(saved.files, kept.files);
  passed.push('送信中Source反映/停止で旧応答を中断/Source保持');
  console.log(JSON.stringify({ passed }));
} finally {
  if (run) await api(`${path}/stop`, { runId: run.runId }).catch(() => {});
}
