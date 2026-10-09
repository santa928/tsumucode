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
import { ProjectApplyError } from './project-engine.mjs';

async function fixture(operation, preview = false, limits = PROJECT_LIMITS) {
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
    async applyProject() {},
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
  const transport = preview
    ? {
        async prepare() {},
        async seal() {
          return { dev: 1, ino: 2 };
        },
        async remove() {},
      }
    : undefined;
  const manager = new ResidentWorkspace({
    store,
    owner: 'owner',
    image: 'fixed',
    graderImage: 'fixed-grader',
    slot,
    engine,
    transport,
    limits,
  });
  try {
    await operation({
      manager,
      store,
      engine,
      slot,
      removed,
      transport,
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

function gradeInput(workspace) {
  return {
    runId: workspace.lastRun.runId,
    expectedSourceRevision: workspace.sourceRevision,
    expectedSourceHash: workspace.sourceHash,
  };
}

test('採点予約の409は正常runとPreviewを保持する', async () => {
  await fixture(async ({ manager, engine, removed, recovery, isActive }) => {
    await manager.start('one', { expectedSourceRevision: 1 });
    const ready = await state(manager, 'ready');
    engine.gradeProject = async () => {
      throw new RequestError(409, '予約中');
    };
    await assert.rejects(manager.grade('one', gradeInput(ready)), { status: 409 });
    assert.equal((await manager.status('one')).lastRun.state, 'ready');
    assert.equal(isActive(), true);
    assert.equal(recovery(), false);
    assert.equal(removed.includes('learner'), false);
  }, true);
});

test('採点基盤の503は診断を返してもrunを回収し、次回起動前に清掃する', async () => {
  await fixture(async ({ manager, engine, removed, recovery, isActive }) => {
    await manager.start('one', { expectedSourceRevision: 1 });
    const ready = await state(manager, 'ready');
    engine.gradeProject = async () => {
      throw new RequestError(503, '採点用Browserが終了しました。');
    };
    await assert.rejects(manager.grade('one', gradeInput(ready)), { status: 503 });
    const stopped = await state(manager, 'failed');
    assert.equal(stopped.lastRun.reason, 'grade-failed');
    assert.equal(isActive(), false);
    assert.equal(recovery(), true);
    assert.ok(removed.includes('learner'));
    await manager.start('one', { expectedSourceRevision: 1 });
    await state(manager, 'ready');
    assert.ok(removed.includes('owner'));
    assert.equal(recovery(), false);
  }, true);
});

test('採点は保存/反映版を前後に確認し、採点中の保存と別runの結果を合格にしない', async () => {
  await fixture(async ({ manager, engine }) => {
    await manager.start('one', { expectedSourceRevision: 1 });
    const ready = await state(manager, 'ready');
    let entered;
    let finish;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    engine.gradeProject = async ({ source, runId }) => {
      entered();
      await new Promise((resolve) => {
        finish = resolve;
      });
      return {
        workspaceId: source.workspaceId,
        runId,
        sourceRevision: source.sourceRevision,
        sourceHash: source.sourceHash,
        status: 'pass',
      };
    };
    const grading = manager.grade('one', gradeInput(ready));
    const rejected = assert.rejects(grading, { status: 409 });
    await started;
    await assert.rejects(manager.grade('one', gradeInput(ready)), { status: 409 });
    await assert.rejects(manager.apply('one', gradeInput(ready)), { status: 409 });
    await manager.save('one', {
      expectedSourceRevision: 1,
      files: { ...STARTER_FILES, 'message.js': 'new' },
    });
    finish();
    await rejected;
    await assert.rejects(manager.grade('one', gradeInput(ready)), { status: 409 });
    assert.equal((await manager.status('one')).lastRun.state, 'ready');
  }, true);
});

test('採点中の停止はgraderの中断/回収を待ち、後着の合格を返さない', async () => {
  await fixture(async ({ manager, engine, removed, isActive }) => {
    await manager.start('one', { expectedSourceRevision: 1 });
    const ready = await state(manager, 'ready');
    let entered;
    let aborted;
    let finish;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const cancellation = new Promise((resolve) => {
      aborted = resolve;
    });
    engine.gradeProject = async ({ source, runId, signal }) => {
      signal.addEventListener('abort', aborted, { once: true });
      entered();
      await new Promise((resolve) => {
        finish = resolve;
      });
      return {
        workspaceId: source.workspaceId,
        runId,
        sourceRevision: source.sourceRevision,
        sourceHash: source.sourceHash,
        status: 'pass',
      };
    };
    const rejected = assert.rejects(manager.grade('one', gradeInput(ready)), { status: 409 });
    await started;
    const stopping = manager.stop('one', { runId: ready.lastRun.runId });
    await cancellation;
    await delay(100);
    assert.equal(isActive(), true);
    assert.equal(removed.includes('learner'), false);
    finish();
    await Promise.all([rejected, stopping]);
    assert.equal(isActive(), false);
    assert.equal((await manager.status('one')).lastRun.state, 'stopped');
  }, true);
});

test('graderの回収不明は停止し、次の起動前にowner回収barrierを通す', async () => {
  await fixture(async ({ manager, engine, recovery, removed }) => {
    await manager.start('one', { expectedSourceRevision: 1 });
    const ready = await state(manager, 'ready');
    engine.gradeProject = async () => {
      throw new Error('grader removal uncertain');
    };
    await assert.rejects(manager.grade('one', gradeInput(ready)), /removal uncertain/u);
    await state(manager, 'failed');
    assert.equal(recovery(), true);
    await manager.start('one', { expectedSourceRevision: 1 });
    await state(manager, 'ready');
    assert.equal(removed.includes('owner'), true);
  }, true);
});

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

test('反映は保存版/hash/runを照合し、反映中の保存でも反映版を巻き戻さない', async () => {
  await fixture(async ({ manager, engine }) => {
    const started = await manager.start('one', { expectedSourceRevision: 1 });
    await state(manager, 'ready');
    const saved = await manager.save('one', {
      expectedSourceRevision: 1,
      files: { ...STARTER_FILES, 'message.js': 'second' },
    });
    await assert.rejects(
      manager.apply('one', {
        runId: started.runId,
        expectedSourceRevision: 1,
        expectedSourceHash: saved.sourceHash,
      }),
      { status: 409 },
    );
    let entered;
    let release;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    engine.applyProject = (id, source, runId, transport) =>
      new Promise((resolve) => {
        assert.equal(id, 'learner');
        assert.equal(source.sourceRevision, 2);
        assert.equal(runId, started.runId);
        assert.deepEqual(transport.socket, { dev: 1, ino: 2 });
        assert.equal(transport.applied.sourceRevision, 1);
        entered();
        release = resolve;
      });
    const apply = manager.apply('one', {
      runId: started.runId,
      expectedSourceRevision: 2,
      expectedSourceHash: saved.sourceHash,
    });
    await waiting;
    assert.equal((await manager.status('one')).lastRun.state, 'applying');
    await assert.rejects(
      manager.apply('one', {
        runId: started.runId,
        expectedSourceRevision: 2,
        expectedSourceHash: saved.sourceHash,
      }),
      { status: 409 },
    );
    await manager.save('one', {
      expectedSourceRevision: 2,
      files: { ...STARTER_FILES, 'message.js': 'third' },
    });
    release();
    const result = await apply;
    assert.equal(result.sourceRevision, 3);
    assert.equal(result.lastRun.sourceRevision, 2);
    assert.equal(result.lastRun.sourceHash, saved.sourceHash);
    await manager.stop('one', { runId: started.runId });
    assert.equal(manager.previewTarget(), undefined);
  }, true);
});

test('反映中の停止と反映失敗はreadyに復帰せずSourceを保持する', async () => {
  await fixture(async ({ manager, engine }) => {
    const started = await manager.start('one', { expectedSourceRevision: 1 });
    const ready = await state(manager, 'ready');
    let entered;
    let release;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    engine.applyProject = () =>
      new Promise((resolve) => {
        entered();
        release = resolve;
      });
    const apply = manager.apply('one', {
      runId: started.runId,
      expectedSourceRevision: 1,
      expectedSourceHash: ready.sourceHash,
    });
    await waiting;
    const rejected = assert.rejects(apply, { status: 409 });
    const stopped = manager.stop('one', { runId: started.runId });
    release();
    await rejected;
    assert.equal((await stopped).lastRun.state, 'stopped');
    const second = await manager.start('one', { expectedSourceRevision: 1 });
    await state(manager, 'ready');
    engine.applyProject = async () => {
      throw new ProjectApplyError('exec-start', 'deadline');
    };
    await assert.rejects(
      manager.apply('one', {
        runId: second.runId,
        expectedSourceRevision: 1,
        expectedSourceHash: ready.sourceHash,
      }),
    );
    const failed = await state(manager, 'failed');
    assert.equal(failed.lastRun.reason, 'apply-failed');
    assert.deepEqual(failed.files, STARTER_FILES);
  }, true);
});

test('反映記録の保存待ちで停止した場合は固定execを呼ばない', async () => {
  await fixture(async ({ manager, store, engine }) => {
    const started = await manager.start('one', { expectedSourceRevision: 1 });
    const ready = await state(manager, 'ready');
    const original = store.updateRun.bind(store);
    let enter;
    let release;
    const entered = new Promise((resolve) => {
      enter = resolve;
    });
    store.updateRun = async (id, run) => {
      if (run.state === 'applying') {
        enter();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return original(id, run);
    };
    let calls = 0;
    engine.applyProject = async () => {
      calls++;
    };
    const applying = manager.apply('one', {
      runId: started.runId,
      expectedSourceRevision: 1,
      expectedSourceHash: ready.sourceHash,
    });
    await entered;
    const rejected = assert.rejects(applying, { status: 409 });
    const stopped = manager.stop('one', { runId: started.runId });
    release();
    await rejected;
    assert.equal((await stopped).lastRun.state, 'stopped');
    assert.equal(calls, 0);
  }, true);
});

test('prepareの途中失敗は自身のtransportも回収し、回収失敗はbarrierへ残す', async () => {
  await fixture(async ({ manager, transport, recovery, engine }) => {
    let removed = 0;
    let created = 0;
    const original = engine.docker;
    engine.docker = async (...args) => {
      if (args[1] === '/containers/create') created++;
      return original(...args);
    };
    transport.prepare = async () => {
      throw new Error('chmod failed after mkdir');
    };
    transport.remove = async () => {
      removed++;
    };
    await manager.start('one', { expectedSourceRevision: 1 });
    await state(manager, 'failed');
    assert.equal(removed, 1);
    assert.equal(created, 0);
    transport.remove = async () => {
      throw new Error('cleanup failed');
    };
    await manager.start('one', { expectedSourceRevision: 1 });
    const failed = await state(manager, 'failed');
    assert.equal(failed.lastRun.cleanupPending, true);
    assert.equal(recovery(), true);
  }, true);
});

test('sealが起動期限を越えた場合はreadyとPreviewを公開しない', async () => {
  await fixture(
    async ({ manager, transport }) => {
      transport.seal = async () => {
        await delay(70);
        return { dev: 1, ino: 2 };
      };
      await manager.start('one', { expectedSourceRevision: 1 });
      const failed = await state(manager, 'failed');
      assert.equal(failed.lastRun.reason, 'startup-timeout');
      assert.equal(manager.previewTarget(), undefined);
    },
    true,
    { ...PROJECT_LIMITS, startMs: 50 },
  );
});
