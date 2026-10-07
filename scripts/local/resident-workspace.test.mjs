import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkspaceStore } from './workspace-store.mjs';
import { ResidentWorkspace } from './resident-workspace.mjs';
import { STARTER_FILES, PROJECT_LIMITS } from './project-protocol.mjs';
import { RequestError } from './protocol.mjs';

async function fixture(operation) {
  const directory = await mkdtemp(join(tmpdir(), 'resident-test-'));
  const store = new WorkspaceStore(directory);
  await store.save('one', 0, STARTER_FILES);
  let active;
  let recovery = false;
  const removed = [];
  const engine = {
    async projectImage() {
      return 'fixed-image';
    },
    projectConfig() {
      return {};
    },
    async docker(method, path) {
      if (path === '/containers/create') return { Id: 'learner' };
      if (path.endsWith('/json')) return { State: { Running: true } };
    },
    async probeProject() {
      return true;
    },
    followOutput() {
      return { done: new Promise(() => {}), close() {} };
    },
    async cleanupOwned(owner) {
      removed.push(owner);
    },
    async removeContainer(id) {
      removed.push(id);
    },
  };
  const slot = {
    acquire(run) {
      if (active) throw new RequestError(409, 'busy');
      active = run;
    },
    release(run) {
      assert.equal(active, run);
      active = undefined;
    },
    async ready() {
      if (recovery) {
        await engine.cleanupOwned('owner');
        recovery = false;
      }
    },
    recoveryNeeded() {
      recovery = true;
    },
  };
  const manager = new ResidentWorkspace({ store, owner: 'owner', image: 'fixed', slot, engine });
  try {
    await operation({
      manager,
      store,
      engine,
      slot,
      removed,
      isActive: () => Boolean(active),
      recovery: () => recovery,
    });
  } finally {
    await manager.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
}

async function state(manager, expected) {
  for (let i = 0; i < 50; i++) {
    const result = await manager.status('one');
    if (result.lastRun?.state === expected) return result;
    await delay(20);
  }
  throw new Error(`Missing state ${expected}`);
}

test('起動中も共有枠を占有し、停止と保存の競合・古い停止を安全に扱う', async () => {
  await fixture(async ({ manager, store, isActive }) => {
    const first = await manager.start('one', { expectedSourceRevision: 1 });
    assert.equal(isActive(), true);
    await assert.rejects(manager.start('one', { expectedSourceRevision: 1 }), {
      status: 409,
    });
    await state(manager, 'ready');
    await assert.rejects(manager.reset('one', { expectedSourceRevision: 1, confirmReset: true }), {
      status: 409,
    });
    await manager.save('one', {
      expectedSourceRevision: 1,
      files: { ...STARTER_FILES, 'message.js': 'new' },
    });
    const ready = await manager.status('one');
    assert.equal(ready.sourceRevision, 2);
    assert.equal(ready.lastRun.sourceRevision, 1);
    await manager.stop('one', { runId: first.runId });
    assert.equal(isActive(), false);
    assert.equal((await store.read('one')).sourceRevision, 2);
    const second = await manager.start('one', { expectedSourceRevision: 2 });
    await assert.rejects(manager.stop('one', { runId: first.runId }), { status: 409 });
    await manager.stop('one', { runId: second.runId });
  });
});

test('create応答喪失はowner回収を行い、削除失敗は次の実行前に回収を要求する', async () => {
  await fixture(async ({ manager, engine, removed, recovery }) => {
    const original = engine.docker;
    engine.docker = async (method, path) => {
      if (path === '/containers/create') throw new Error('response lost');
      return original(method, path);
    };
    await manager.start('one', { expectedSourceRevision: 1 });
    await state(manager, 'failed');
    assert.deepEqual(removed, ['owner']);
    assert.equal(recovery(), true);
    engine.docker = original;
    const cleanup = await manager.start('one', { expectedSourceRevision: 1 });
    await state(manager, 'ready');
    engine.removeContainer = async () => {
      throw new Error('unavailable');
    };
    await manager.stop('one', { runId: cleanup.runId });
    assert.equal((await manager.status('one')).lastRun.cleanupPending, true);
    await assert.rejects(manager.reset('one', { expectedSourceRevision: 1, confirmReset: true }), {
      status: 409,
    });
    assert.equal(recovery(), true);
    engine.cleanupOwned = async () => {
      throw new Error('unavailable');
    };
    await assert.rejects(manager.start('one', { expectedSourceRevision: 1 }));
  });
});

test('遅いprobeの途中の停止はreadyへ戻らず、終了記録の保存失敗も状態に残る', async () => {
  await fixture(async ({ manager, engine, store }) => {
    let probeStarted;
    let finishProbe;
    const entered = new Promise((resolve) => {
      probeStarted = resolve;
    });
    engine.probeProject = () =>
      new Promise((resolve) => {
        finishProbe = resolve;
        probeStarted();
      });
    const first = await manager.start('one', { expectedSourceRevision: 1 });
    await entered;
    const original = store.updateRun.bind(store);
    store.updateRun = async (id, run) => {
      if (run.state === 'stopped') throw new Error('disk full');
      return original(id, run);
    };
    const stopped = manager.stop('one', { runId: first.runId });
    finishProbe(true);
    const result = await stopped;
    assert.equal(result.lastRun.state, 'failed');
    assert.equal(result.lastRun.reason, 'state-save-failed');
    assert.equal((await manager.status('one')).lastRun.state, 'failed');
  });
});

test('APIからrun IDを指定できず、旧IDで次runを停止できない', async () => {
  await fixture(async ({ manager }) => {
    await assert.rejects(manager.start('one', { expectedSourceRevision: 1, runId: 'old' }), {
      status: 400,
    });
    const first = await manager.start('one', { expectedSourceRevision: 1 });
    await manager.stop('one', { runId: first.runId });
    const second = await manager.start('one', { expectedSourceRevision: 1 });
    assert.notEqual(second.runId, first.runId);
    await assert.rejects(manager.stop('one', { runId: first.runId }), { status: 409 });
    await manager.stop('one', { runId: second.runId });
  });
});

test('期限直前のHTTP probeが遅れて成功してもreadyにしない', async () => {
  await fixture(async ({ store, slot, engine }) => {
    engine.probeProject = async () => {
      await delay(100);
      return true;
    };
    const manager = new ResidentWorkspace({
      store,
      owner: 'owner',
      image: 'fixed',
      slot,
      engine,
      limits: { ...PROJECT_LIMITS, startMs: 50 },
    });
    await manager.start('one', { expectedSourceRevision: 1 });
    const failed = await state(manager, 'failed');
    assert.equal(failed.lastRun.reason, 'startup-timeout');
  });
});

test.each(['ready', 'image'])(
  'resident %s準備中のshutdownはSourceと停止記録を残しcreateしない',
  async (stage) => {
    await fixture(async ({ manager, slot, engine, isActive }) => {
      let enter;
      let release;
      const entered = new Promise((resolve) => {
        enter = resolve;
      });
      const hold = () =>
        new Promise((resolve) => {
          release = resolve;
          enter();
        });
      if (stage === 'ready') slot.ready = hold;
      else engine.projectImage = hold;
      let created = 0;
      let started = 0;
      const original = engine.docker;
      engine.docker = (...args) => {
        if (args[1] === '/containers/create') created++;
        if (args[1].endsWith('/start')) started++;
        return original(...args);
      };
      const starting = manager.start('one', { expectedSourceRevision: 1 });
      await entered;
      const stopping = manager.shutdown();
      release('fixed-image');
      await starting;
      await stopping;
      assert.equal(created, 0);
      assert.equal(started, 0);
      assert.equal(isActive(), false);
      const record = await manager.status('one');
      assert.equal(record.lastRun.state, 'stopped');
      assert.equal(record.lastRun.reason, 'controller-stopped');
      assert.deepEqual(record.files, STARTER_FILES);
    });
  },
);

test('起動応答前の接続切断は準備を中止し、未通知runを作成しない', async () => {
  await fixture(async ({ manager, engine, isActive }) => {
    let entered;
    let release;
    const paused = new Promise((resolve) => {
      entered = resolve;
    });
    engine.projectImage = () =>
      new Promise((resolve) => {
        release = resolve;
        entered();
      });
    let created = 0;
    const original = engine.docker;
    engine.docker = (...args) => {
      if (args[1] === '/containers/create') created++;
      return original(...args);
    };
    const cancellation = new globalThis.AbortController();
    const starting = manager.start('one', { expectedSourceRevision: 1 }, cancellation.signal);
    await paused;
    cancellation.abort();
    release('fixed-image');
    await assert.rejects(starting, { status: 408 });
    const record = await state(manager, 'stopped');
    assert.equal(created, 0);
    assert.equal(isActive(), false);
    assert.equal(record.lastRun.reason, 'client-disconnected');
    assert.deepEqual(record.files, STARTER_FILES);
  });
});

test('status pollはidleを延長しない（短縮された内部診断期限）', async () => {
  await fixture(async ({ store, slot, engine }) => {
    const manager = new ResidentWorkspace({
      store,
      owner: 'owner',
      image: 'fixed',
      slot,
      engine,
      limits: { ...PROJECT_LIMITS, idleMs: 100, lifetimeMs: 5000 },
    });
    await manager.start('one', { expectedSourceRevision: 1 });
    const result = await state(manager, 'idle');
    assert.equal(result.lastRun.reason, 'idle');
    assert.equal(result.sourceRevision, 1);
  });
});
