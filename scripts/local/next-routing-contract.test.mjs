import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from './workspace-store.mjs';
import { NEXT_PROFILE, NEXT_WORKSPACE, nextWorkspace } from './next-project-protocol.mjs';
import { projectHash, validateFiles } from './project-protocol.mjs';

const directories = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Next教材別の固定Source境界', () => {
  it('Workspace別に保存・hash・resetを対応させ、異なる固定fileを混ぜない', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'next-routing-'));
    directories.push(directory);
    const store = new WorkspaceStore(directory);
    for (const workspace of [NEXT_WORKSPACE, 'next-ch02-l01-e01', 'next-ch02-l02-e01']) {
      const { files } = nextWorkspace(workspace);
      const saved = await store.save(workspace, 0, files);
      expect(saved.sourceHash).toBe(projectHash(files, NEXT_PROFILE, workspace));
      const changed = await store.save(workspace, 1, {
        ...files,
        'app/page.tsx': files['app/page.tsx'] + '\n',
      });
      expect(changed.sourceHash).not.toBe(saved.sourceHash);
      expect((await store.reset(workspace, 2)).files).toEqual(files);
      const other = workspace === NEXT_WORKSPACE ? 'next-ch02-l01-e01' : NEXT_WORKSPACE;
      expect(() => validateFiles(nextWorkspace(other).files, NEXT_PROFILE, workspace)).toThrow();
    }
    expect(() =>
      validateFiles(nextWorkspace(NEXT_WORKSPACE).files, NEXT_PROFILE, 'unknown-next'),
    ).toThrow();
  });
});
