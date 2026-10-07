import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from './workspace-store.mjs';
import { STARTER_FILES, projectHash } from './project-protocol.mjs';

async function fixture(operation) {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-test-'));
  try {
    await operation(new WorkspaceStore(directory), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('同じ期待版の保存は1件だけ成功し、旧run終了で最新Sourceを戻さない', async () => {
  await fixture(async (store) => {
    await store.save('one', 0, STARTER_FILES);
    const run = { runId: 'first', state: 'starting' };
    await store.claimRun('one', 1, run);
    const files = { ...STARTER_FILES, 'message.js': 'export const message = 2;' };
    const results = await Promise.allSettled([
      store.save('one', 1, files),
      store.save('one', 1, STARTER_FILES),
      store.updateRun('one', { ...run, state: 'stopped' }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    let record = await store.read('one');
    assert.equal(record.sourceRevision, 2);
    assert.deepEqual(record.files, files);
    assert.equal(record.sourceHash, projectHash(files));
    await store.claimRun('one', 2, { runId: 'second', state: 'starting' });
    await store.updateRun('one', { ...run, state: 'failed' });
    record = await store.read('one');
    assert.equal(record.lastRun.runId, 'second');
    assert.equal(record.sourceRevision, 2);
    await assert.rejects(store.claimRun('one', 1, { runId: 'third' }), { status: 409 });
  });
});

test('Sourceを再取得でき、再起動とResetは他Workspaceを変更しない', async () => {
  await fixture(async (store, directory) => {
    const files = { ...STARTER_FILES, 'message.js': 'export const message = 42;' };
    await store.save('one', 0, files);
    await store.save('two', 0, files);
    await store.claimRun('one', 1, { runId: 'first', state: 'ready' });
    const restarted = new WorkspaceStore(directory);
    await restarted.recover();
    assert.equal((await restarted.read('one')).lastRun.reason, 'controller-restarted');
    assert.deepEqual((await restarted.read('one')).files, files);
    await restarted.reset('one', 1);
    assert.deepEqual((await restarted.read('one')).files, STARTER_FILES);
    assert.deepEqual((await restarted.read('two')).files, files);
  });
});

test('未知file・過大Source・symlink・保存障害を成功扱いにしない', async () => {
  await fixture(async (store, directory) => {
    assert.throws(() => store.save('../other', 0, STARTER_FILES), { status: 400 });
    for (const files of [
      { ...STARTER_FILES, '.env': 'secret' },
      { ...STARTER_FILES, 'main.js': { type: 'symlink' } },
      { ...STARTER_FILES, 'main.js': 'x'.repeat(102401) },
    ])
      assert.throws(() => store.save('one', 0, files));
    await store.save('one', 0, STARTER_FILES);
    const original = await readFile(join(directory, 'one.json'), 'utf8');
    await symlink(join(directory, 'one.json'), join(directory, 'two.json'));
    await assert.rejects(store.save('two', 0, STARTER_FILES), /Invalid Source file/u);
    assert.equal(await readFile(join(directory, 'one.json'), 'utf8'), original);
    await mkdir(join(directory, 'blocked.json'));
    await assert.rejects(store.save('blocked', 0, STARTER_FILES), /Invalid Source file/u);
  });
});

test('保存件数の上限を超える新規保存を拒否し、既存の更新は可能', async () => {
  await fixture(async (store) => {
    for (let i = 0; i < 16; i++) await store.save(`w-${i}`, 0, STARTER_FILES);
    await assert.rejects(store.save('extra', 0, STARTER_FILES), { status: 409 });
    assert.equal((await store.save('w-0', 1, STARTER_FILES)).sourceRevision, 2);
  });
});
