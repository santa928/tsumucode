import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PracticeRun, PracticeRunner } from './python-practice.mjs';

/** killの応答と停止完了を分離し、削除故障時の停止確認を観測する。 */
function pendingStop(paused, waitFails = false, exitsBeforeKill = false) {
  let stopped = false;
  let unpaused = !paused;
  let killRequested = false;
  const calls = [];
  const api = async (method, path, body, timeout) => {
    calls.push({ method, path, timeout });
    if (method === 'DELETE') throw new Error('author injected DELETE failure');
    if (method === 'GET' && path === '/containers/owned/json') {
      return { State: { Running: !stopped, Paused: !unpaused } };
    }
    if (method === 'POST' && path === '/containers/owned/unpause') {
      unpaused = true;
      return;
    }
    if (method === 'POST' && path === '/containers/owned/kill') {
      assert.equal(unpaused, true);
      killRequested = true;
      if (exitsBeforeKill) {
        stopped = true;
        throw Object.assign(new Error('container already stopped'), { status: 409 });
      }
      return;
    }
    if (method === 'POST' && path === '/containers/owned/wait?condition=not-running') {
      assert.equal(killRequested, true);
      assert.equal(timeout, 1500);
      if (waitFails) throw new Error('author injected stop wait timeout');
      stopped = true;
      return { StatusCode: 137 };
    }
    throw new Error(`unexpected API: ${method} ${path}`);
  };
  const runner = new PracticeRunner('python-stop-test', '', api);
  const run = new PracticeRun(runner, {
    exerciseId: 'python-basics-ch01-l02-e01',
    exerciseSessionId: 'stop-test',
    executionRevision: 1,
    files: { 'main.py': 'print(1)\n' },
  });
  runner.active = run;
  run.containerId = 'owned';
  run.creation = Promise.resolve();
  return { run, runner, calls };
}

for (const paused of [false, true]) {
  test(`削除故障時は${paused ? 'paused' : 'active'}のkill応答後も停止完了を待ち、次runを拒否する`, async () => {
    const { run, runner, calls } = pendingStop(paused);
    await run.stop('cancelled');
    assert.equal(run.stoppedConfirmed, true);
    assert.equal(runner.recoveryNeeded, true);
    assert.equal(run.removed, undefined);
    assert.equal(run.snapshot().stdout, '');
    assert.equal(await run.done, undefined);
    assert.equal(calls.at(-1).path, '/containers/owned/json');
    await assert.rejects(runner.create({}), /recovery-needed/u);
  });
}

test('kill前に終了して409でも、実停止を確認して削除未確認の排他を維持する', async () => {
  const { run, runner, calls } = pendingStop(true, false, true);
  await run.stop('cancelled');
  assert.equal(run.stoppedConfirmed, true);
  assert.equal(runner.recoveryNeeded, true);
  assert.equal(run.removed, undefined);
  assert.equal(calls.at(-1).path, '/containers/owned/json');
  await assert.rejects(runner.create({}), /recovery-needed/u);
});

test('停止完了を確認できなければ停止確認を成功にせず、次runも許可しない', async () => {
  const { run, runner } = pendingStop(false, true);
  await run.stop('cancelled');
  assert.equal(run.stoppedConfirmed, false);
  assert.equal(runner.recoveryNeeded, true);
  assert.equal(run.removed, undefined);
  await assert.rejects(runner.create({}), /recovery-needed/u);
});
