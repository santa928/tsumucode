import { test } from 'node:test';
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
