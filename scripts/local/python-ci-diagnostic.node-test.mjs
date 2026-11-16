import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as engine from './docker-engine.mjs';

const inspect = {
  State: { OOMKilled: false, ExitCode: 137, Error: 'private error' },
  HostConfig: { Memory: 268435456, MemorySwap: 268435456 },
  Config: { Env: ['SECRET=private'], Cmd: ['learner source'] },
};
function temp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'python-ci-diagnostic-'));
  try { return fn(join(dir, 'diagnostic.json'), dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
test('明示 opt-in がなければ記録も読み出しも行わない', () => temp((path) => {
  assert.equal(typeof engine.capturePythonCiDiagnostic, 'function');
  assert.equal(engine.capturePythonCiDiagnostic({ enabled: false, path, runId: 'one', inspected: inspect }), false);
  assert.equal(engine.capturePythonCiDiagnostic({ enabled: '1', path, runId: 'one', inspected: inspect }), false);
  assert.equal(engine.readPythonCiDiagnostic({ enabled: false, path, runId: 'one' }), null);
  assert.throws(() => readFileSync(path), { code: 'ENOENT' });
}));
test('同一 run の診断だけを固定項目として読み、秘密と入力は保存しない', () => temp((path) => {
  assert.equal(typeof engine.capturePythonCiDiagnostic, 'function');
  assert.equal(engine.capturePythonCiDiagnostic({ enabled: true, path, runId: 'one', inspected: inspect }), true);
  const raw = readFileSync(path, 'utf8');
  assert.doesNotMatch(raw, /private|secret|learner|one/iu);
  assert.ok(raw.length < 512);
  assert.deepEqual(engine.readPythonCiDiagnostic({ enabled: true, path, runId: 'one' }), { oom: false, exit: 137, memory: 268435456, swap: 268435456, errorPresent: true });
  assert.equal(engine.readPythonCiDiagnostic({ enabled: true, path, runId: 'different' }), null);
  const original = raw;
  assert.equal(engine.capturePythonCiDiagnostic({ enabled: true, path, runId: 'other', inspected: inspect }), false);
  assert.equal(readFileSync(path, 'utf8'), original);
}));
test('既存ファイル・シンボリックリンクを上書きせず、入出力エラーは結果に伝播しない', () => temp((path, dir) => {
  assert.equal(typeof engine.capturePythonCiDiagnostic, 'function');
  writeFileSync(path, 'old');
  assert.equal(engine.capturePythonCiDiagnostic({ enabled: true, path, runId: 'one', inspected: inspect }), false);
  assert.equal(readFileSync(path, 'utf8'), 'old');
  assert.equal(engine.readPythonCiDiagnostic({ enabled: true, path, runId: 'one' }), null);
  const link = join(dir, 'link');
  symlinkSync(path, link);
  assert.equal(engine.capturePythonCiDiagnostic({ enabled: true, path: link, runId: 'one', inspected: inspect }), false);
  assert.equal(engine.readPythonCiDiagnostic({ enabled: true, path: link, runId: 'one' }), null);
  assert.doesNotThrow(() => engine.capturePythonCiDiagnostic({ enabled: true, path: join(dir, 'missing', 'diagnostic'), runId: 'one', inspected: inspect }));
  assert.doesNotThrow(() => engine.capturePythonCiDiagnostic({ enabled: true, path: join(dir, 'throws'), runId: 'one', inspected: { get State() { throw new Error('private'); } } }));
}));
test('過大・不正・未知属性を拒否して読まない', () => temp((path) => {
  assert.equal(typeof engine.readPythonCiDiagnostic, 'function');
  writeFileSync(path, 'x'.repeat(513));
  assert.equal(engine.readPythonCiDiagnostic({ enabled: true, path, runId: 'one' }), null);
  writeFileSync(path, '{"secret":"private"}');
  assert.equal(engine.readPythonCiDiagnostic({ enabled: true, path, runId: 'one' }), null);
}));
test('同一 ID の古い診断を準備時に消し、除去不能なら読取を無効にする', () => temp((path) => {
  assert.equal(typeof engine.preparePythonCiDiagnostic, 'function');
  assert.equal(engine.capturePythonCiDiagnostic({ enabled: true, path, runId: 'reused', inspected: inspect }), true);
  const prepareFailed = engine.preparePythonCiDiagnostic({ enabled: true, path, remove: () => { throw new Error('storage failed'); } });
  assert.equal(prepareFailed, false);
  assert.equal(engine.readPythonCiDiagnostic({ enabled: prepareFailed, path, runId: 'reused' }), null);
  assert.ok(readFileSync(path));
  assert.equal(engine.preparePythonCiDiagnostic({ enabled: true, path }), true);
  assert.equal(engine.readPythonCiDiagnostic({ enabled: true, path, runId: 'reused' }), null);
  const next = { ...inspect, State: { ...inspect.State, Error: '' } };
  assert.equal(engine.capturePythonCiDiagnostic({ enabled: true, path, runId: 'reused', inspected: next }), true);
  assert.equal(engine.readPythonCiDiagnostic({ enabled: true, path, runId: 'reused' }).errorPresent, false);
}));
test('learner コンテナは診断領域を持たず外部通信を許可しない', () => {
  const config = engine.containerConfig({ 'main.py': 'print(1)' }, 'test-owner', true);
  assert.equal(config.HostConfig.NetworkMode, 'none');
  assert.equal(config.NetworkDisabled, true);
  assert.deepEqual(Object.keys(config.HostConfig.Tmpfs).sort(), ['/tmp', '/workspace']);
  assert.equal(config.HostConfig.Binds, undefined);
  assert.equal(config.HostConfig.Mounts, undefined);
  assert.equal(config.Env.some((item) => item.startsWith('TSUMUCODE_PYTHON_CI_DIAGNOSTICS=')), false);
});

test('CI-only learner timeline accepts exact owned container and never emits raw event data', async () => {
  const id = 'a'.repeat(64);
  const owned = { Id: id, Config: { Labels: { 'app.tsumucode.owner': 'owner', 'app.tsumucode.role': 'learner' } }, State: { OOMKilled: false, ExitCode: 137, Running: false } };
  const event = JSON.stringify({ Type: 'container', Action: 'oom', status: 'oom', id, Actor: { ID: id, Attributes: { secret: 'PRIVATE_MARKER' } }, time: 1000, timeNano: 1000000000000 });
  const calls = [];
  const api = async (method, path, body, timeout, raw) => { calls.push({ method, path, timeout, raw }); return path.startsWith('/events?') ? Buffer.from(event) : owned; };
  const actual = await engine.observePythonCiExit({ enabled: true, api, id, owner: 'owner', inspected: owned, waitedCode: 137, since: 999, until: 1001, waitAtMs: 1000000 });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.method === 'GET' && c.timeout <= 500));
  assert.deepEqual(actual, { wait: 'matched', first: 'no', second: 'no', change: 'same', oom: 'seen', kill: 'unknown', die: 'unknown', oomWhen: 'near', killWhen: 'unknown', dieWhen: 'unknown' });
  assert.doesNotMatch(JSON.stringify(actual), /PRIVATE_MARKER|owner|aaaaaaaa/);
});

test('CI timeline rejects absent ownership, forged IDs, mismatched events and ambiguous values', async () => {
  const id = 'b'.repeat(64);
  const other = 'c'.repeat(64);
  const owned = { Id: id, Config: { Labels: { 'app.tsumucode.owner': 'owner', 'app.tsumucode.role': 'learner' } }, State: { OOMKilled: false, ExitCode: 137, Running: false } };
  const no = async () => { throw Error('must not call'); };
  assert.equal(await engine.observePythonCiExit({ enabled: false, api: no, id, owner:'owner', inspected:owned, waitedCode:137, since:999, until:1001 }), null);
  assert.equal(await engine.observePythonCiExit({ enabled: true, api: no, id, owner:'other', inspected:owned, waitedCode:137, since:999, until:1001 }), null);
  assert.equal(await engine.observePythonCiExit({ enabled: true, api: no, id:'bad', owner:'owner', inspected:owned, waitedCode:137, since:999, until:1001 }), null);
  const forged = JSON.stringify({ Type:'container', Action:'oom', status:'oom', id:other, Actor:{ ID:id }, time:1000 });
  const api = async (_m, path) => path.startsWith('/events?') ? Buffer.from(forged) : { ...owned, Id: other };
  const actual = await engine.observePythonCiExit({ enabled:true, api, id, owner:'owner', inspected:owned, waitedCode:137, since:999, until:1001 });
  assert.deepEqual(actual, { wait:'matched', first:'no', second:'unknown', change:'unknown', oom:'unknown', kill:'unknown', die:'unknown', oomWhen:'unknown', killWhen:'unknown', dieWhen:'unknown' });
  const error = await engine.observePythonCiExit({ enabled:true, api:async () => { throw Error('PRIVATE_MARKER'); }, id, owner:'owner', inspected:owned, waitedCode:137, since:999, until:1001 });
  assert.equal(error.oom, 'unknown');
  assert.equal(error.second, 'unknown');
  assert.doesNotMatch(JSON.stringify(error), /PRIVATE_MARKER/);
});

test('CI timeline record is same-run, finite, and rejects extra or forged fields', () => temp((path) => {
  const timeline = { wait:'matched', first:'no', second:'yes', change:'unknown', oom:'seen', kill:'unknown', die:'seen', oomWhen:'before', killWhen:'unknown', dieWhen:'near' };
  assert.equal(engine.capturePythonCiDiagnostic({ enabled:true, path, runId:'one', inspected:inspect, timeline }), true);
  assert.deepEqual(engine.readPythonCiDiagnostic({ enabled:true, path, runId:'one' }), { oom:false, exit:137, memory:268435456, swap:268435456, errorPresent:true, timeline });
  assert.equal(engine.readPythonCiDiagnostic({ enabled:true, path, runId:'different' }), null);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  raw.timeline.raw = 'PRIVATE_MARKER'; writeFileSync(path, JSON.stringify(raw));
  assert.equal(engine.readPythonCiDiagnostic({ enabled:true, path, runId:'one' }), null);
}));

test('timeline is bounded, treats contradictory snapshots and malformed event streams as unknown', async () => {
  const id = 'd'.repeat(64);
  const owned = { Id:id, Config:{ Labels:{ 'app.tsumucode.owner':'owner', 'app.tsumucode.role':'learner' } }, State:{ OOMKilled:false, ExitCode:137, Running:false } };
  const newer = { ...owned, State: { ...owned.State, OOMKilled:true } };
  const changed = await engine.observePythonCiExit({ enabled:true, id, owner:'owner', inspected:owned, waitedCode:137, since:999, until:1001,
    api:async (_m,path) => path.startsWith('/events?') ? Buffer.from('{invalid PRIVATE_MARKER') : newer });
  assert.equal(changed.first,'no'); assert.equal(changed.second,'yes'); assert.equal(changed.change,'unknown');
  assert.equal(changed.oom,'unknown'); assert.doesNotMatch(JSON.stringify(changed),/PRIVATE_MARKER/);
  const mismatch = await engine.observePythonCiExit({ enabled:true, id, owner:'owner', inspected:owned, waitedCode:1, since:999, until:1001, api:async()=>{throw Error('must not call');} });
  assert.deepEqual(mismatch, { wait:'unknown', first:'unknown', second:'unknown', change:'unknown', oom:'unknown', kill:'unknown', die:'unknown', oomWhen:'unknown', killWhen:'unknown', dieWhen:'unknown' });
  const started = Date.now();
  const timed = await engine.observePythonCiExit({ enabled:true, id, owner:'owner', inspected:owned, waitedCode:137, since:999, until:1001, api:() => new Promise(()=>{}) });
  assert.ok(Date.now()-started < 1500); assert.equal(timed.second,'unknown'); assert.equal(timed.oom,'unknown');
});

test('conflicting or out-of-window Docker events are not partially trusted', async () => {
  const id = 'e'.repeat(64), other = 'f'.repeat(64);
  const owned = { Id:id, Config:{ Labels:{ 'app.tsumucode.owner':'owner', 'app.tsumucode.role':'learner' } }, State:{ OOMKilled:false, ExitCode:137, Running:false } };
  const event = { Type:'container', Action:'oom', status:'oom', id, Actor:{ ID:id }, time:1000 };
  for (const rows of [[event, {...event,id:other}], [event, {...event,Actor:{ID:other}}], [event,{...event,status:'kill'}], [event,{...event,time:1002}], [event,'bad']]) {
    const observed = await engine.observePythonCiExit({ enabled:true, id, owner:'owner', inspected:owned, waitedCode:137, since:999, until:1001,
      api:async (_m,path) => path.startsWith('/events?') ? Buffer.from(rows.map(x=>JSON.stringify(x)).join('\n')) : owned });
    assert.equal(observed.oom,'unknown');
  }
});

test('event timing is relative to wait without exposing timestamps and rejects contradictions', async () => {
  const id = '9'.repeat(64);
  const owned = { Id:id, Config:{ Labels:{ 'app.tsumucode.owner':'owner', 'app.tsumucode.role':'learner' } }, State:{ OOMKilled:false, ExitCode:137, Running:false } };
  const event = (action, nano) => ({ Type:'container', Action:action, status:action, id, Actor:{ ID:id }, time:Math.floor(nano / 1e9), timeNano:nano });
  const rows = [event('oom',999990000000), event('kill',1000000000000), event('die',1000010000000)];
  const options = { enabled:true, id, owner:'owner', inspected:owned, waitedCode:137, since:999, until:1001, waitAtMs:1000000 };
  const api = async (_m,path) => path.startsWith('/events?') ? Buffer.from(rows.map(x=>JSON.stringify(x)).join('\n')) : owned;
  const result = await engine.observePythonCiExit({ ...options, api });
  assert.equal(result.oomWhen,'before'); assert.equal(result.killWhen,'near'); assert.equal(result.dieWhen,'after');
  assert.doesNotMatch(JSON.stringify(result),/999990|1000000/);
  const conflicting = [...rows, event('oom',1000010000000)];
  const conflict = await engine.observePythonCiExit({ ...options, api:async (_m,path) => path.startsWith('/events?') ? Buffer.from(conflicting.map(x=>JSON.stringify(x)).join('\n')) : owned });
  assert.equal(conflict.oom,'seen'); assert.equal(conflict.oomWhen,'unknown');
  const forged = [...rows, {...rows[0],timeNano:1010000000000}];
  const invalid = await engine.observePythonCiExit({ ...options, api:async (_m,path) => path.startsWith('/events?') ? Buffer.from(forged.map(x=>JSON.stringify(x)).join('\n')) : owned });
  assert.equal(invalid.oom,'unknown'); assert.equal(invalid.oomWhen,'unknown');
});

test('late capture from a different run cannot be adopted by the new run', () => temp((path) => {
  assert.equal(engine.preparePythonCiDiagnostic({ enabled:true, path }),true);
  // A previously-started asynchronous observer completes after the next run prepared.
  assert.equal(engine.capturePythonCiDiagnostic({ enabled:true, path, runId:'old-random-id', inspected:inspect }),true);
  assert.equal(engine.readPythonCiDiagnostic({ enabled:true, path, runId:'new-random-id' }),null);
  assert.equal(engine.capturePythonCiDiagnostic({ enabled:true, path, runId:'new-random-id', inspected:inspect }),false);
  assert.equal(engine.preparePythonCiDiagnostic({ enabled:true, path }),true);
  assert.equal(engine.capturePythonCiDiagnostic({ enabled:true, path, runId:'new-random-id', inspected:inspect }),true);
  assert.equal(engine.readPythonCiDiagnostic({ enabled:true, path, runId:'new-random-id' }).exit,137);
}));
