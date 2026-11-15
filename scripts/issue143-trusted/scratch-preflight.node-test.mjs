import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { executionClass, mountFlag, probe } from './scratch-preflight.mjs';

test('mount flags distinguish noexec, exec, unknown and ambiguous mounts', () => {
  const noexec = '1 2 0:3 / /tmp rw,nosuid,nodev,noexec - tmpfs tmpfs rw\n';
  const exec = '2 2 0:4 / /mock-tmp rw,nosuid,nodev - tmpfs tmpfs rw\n';
  assert.equal(mountFlag(noexec + exec, '/tmp'), 'noexec');
  assert.equal(mountFlag(noexec + exec, '/mock-tmp'), 'exec');
  assert.equal(mountFlag(noexec, '/mock-tmp'), 'unknown');
  assert.equal(mountFlag(noexec + noexec, '/tmp'), 'unknown');
});

test('execution classifications fail closed for errors and signals', () => {
  assert.equal(executionClass({ error: { code: 'EACCES' } }), 'denied');
  assert.equal(executionClass({ status: 0, signal: null }), 'allowed');
  assert.equal(executionClass({ status: 1, signal: null }), 'other');
  assert.equal(executionClass({ status: null, signal: 'SIGTERM' }), 'other');
});

test('the direct probe executes a fixed harmless temporary file when permitted', async () => {
  assert.equal(await probe(tmpdir()), 'allowed');
});
