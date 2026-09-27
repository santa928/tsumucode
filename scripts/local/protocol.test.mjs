import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  authorize,
  validateRun,
  sourceHash,
  ORIGIN,
  EXERCISE_ID,
  PROFILE_ID,
  LIMITS,
} from './protocol.mjs';
import { containerConfig } from './docker-engine.mjs';

/** API利用者が起動設定へ到達できず、既知ファイルだけ送れることを確認する。 */
test('実行入力は固定教材・版・file集合に限定する', () => {
  const input = {
    apiVersion: 1,
    exerciseId: EXERCISE_ID,
    runtimeProfileId: PROFILE_ID,
    contentRevision: 'r1',
    runId: 'run:1',
    exerciseSessionId: 'session:1',
    executionRevision: 0,
    files: { 'script.js': 'console.log(10)', 'index.html': '', 'styles.css': '' },
  };
  for (const exerciseId of [
    'javascript-ch03-l05-e01',
    'javascript-ch03-l05-e02',
    'javascript-ch03-l05-e03',
  ]) {
    const exerciseInput = { ...input, exerciseId };
    assert.equal(validateRun(exerciseInput, 'r1'), exerciseInput);
  }
  for (const mutation of [
    { command: 'sh' },
    { image: 'other' },
    { contentRevision: 'old' },
    { apiVersion: 2 },
    { exerciseId: 'other' },
    { runtimeProfileId: 'other' },
    { executionRevision: -1 },
    { files: { ...input.files, '../secret': 'x' } },
    { files: { '/script.js': 'x' } },
    { files: { ...input.files, 'script.js': 'x'.repeat(LIMITS.sourceBytes + 1) } },
    { files: { ...input.files, 'script.js': { type: 'symlink', target: '/etc/passwd' } } },
  ])
    assert.throws(() => validateRun({ ...input, ...mutation }, 'r1'));
});

/** bootstrapにもHostとOriginを必要とし、通常要求はtokenも必須とする。 */
test('外部Origin・null・不正Host・tokenを拒否する', () => {
  const headers = { host: '127.0.0.1:4173', origin: ORIGIN, 'x-tsumucode-token': 'valid' };
  assert.doesNotThrow(() => authorize(headers, 'valid'));
  for (const change of [
    { origin: 'null' },
    { origin: 'https://santa928.github.io' },
    { origin: undefined },
    { host: 'evil.example:4173' },
    { 'x-tsumucode-token': '' },
    { 'sec-fetch-site': 'cross-site' },
  ]) {
    assert.throws(() => authorize({ ...headers, ...change }, 'valid'));
  }
  assert.throws(() => authorize({ ...headers, origin: 'null' }, 'valid', true));
});

/** HTTP入力を固定制約から独立させ、host mountもsocketも存在しないことを確認する。 */
test('Node設定は固定の隔離と上限を持ちsource hashは内容依存', () => {
  const config = containerConfig({ 'script.js': 'console.log(10)' }, 'test-owner');
  assert.equal(config.User, '1000:1000');
  assert.equal(config.HostConfig.ReadonlyRootfs, true);
  assert.equal(config.HostConfig.NetworkMode, 'none');
  assert.equal(config.HostConfig.PidsLimit, 64);
  assert.equal(config.HostConfig.Memory, 256 * 1024 * 1024);
  assert.equal(config.HostConfig.Binds, undefined);
  assert.deepEqual(config.HostConfig.CapDrop, ['ALL']);
  assert.deepEqual(config.HostConfig.SecurityOpt, ['no-new-privileges:true', 'seccomp=builtin']);
  assert.notEqual(sourceHash('10'), sourceHash('20'));
});
