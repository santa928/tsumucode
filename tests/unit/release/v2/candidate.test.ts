// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashArtifact, hashValue } from '../../../../scripts/release/v2/identity';
const exec = promisify(execFile),
  roots: string[] = [];
const plan = {
  schemaVersion: 1,
  inventoryDigest: 'a'.repeat(64),
  publishedCourses: ['topic'],
  targets: [
    {
      key: 'topic/lesson/persistence',
      kind: 'persistence',
      courseId: 'topic',
      lessonId: 'lesson',
      inputDigest: 'b'.repeat(64),
    },
  ],
};
async function checkout() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-checkout-'));
  roots.push(root);
  const git = (...args: string[]) => exec('git', args, { cwd: root });
  await git('init', '-b', 'main');
  await mkdir(path.join(root, '.github/workflows'), { recursive: true });
  await writeFile(path.join(root, '.github/workflows/pages.yml'), 'name: reviewed workflow\n');
  await writeFile(path.join(root, 'package-lock.json'), 'fixed lock\n');
  await writeFile(path.join(root, 'Dockerfile'), 'FROM fixed-image\n');
  await writeFile(path.join(root, '.gitignore'), 'dist/\n');
  await git('add', '.');
  await git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'fixture',
  );
  const source = (await git('rev-parse', 'HEAD')).stdout.trim();
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist/index.html'), 'one build');
  return { root, source };
}
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
describe('trusted main build identity', () => {
  it('binds the actual checkout, lock, workflow, plan, bytes and stable build-job key', async () => {
    const { createCandidate } = await import('../../../../scripts/release/v2/candidate');
    const { root, source } = await checkout();
    vi.stubEnv('GIT_DIR', path.join(root, 'foreign-git'));
    vi.stubEnv('GIT_WORK_TREE', path.join(root, 'foreign-tree'));
    const candidate = await createCandidate(root, path.join(root, 'dist'), plan, '301', {
      repository: 'owner/site',
      runId: '101',
      jobId: 'build',
      attempt: 1,
      sourceCommit: source,
      eventName: 'workflow_dispatch',
      ref: 'refs/heads/main',
    });
    expect(candidate.recipe.sourceCommit).toBe(source);
    expect(candidate.planDigest).toBe(hashValue(plan));
    expect(candidate.artifactDigest).toBe((await hashArtifact(path.join(root, 'dist'))).digest);
    expect(candidate.buildJobId).toBe('build');
  });
  it.each(['branch', 'event', 'source', 'dirty', 'untracked'])(
    'rejects %s identity before qualifying a build',
    async (failure) => {
      const { createCandidate } = await import('../../../../scripts/release/v2/candidate');
      const { root, source } = await checkout();
      if (failure === 'dirty') await writeFile(path.join(root, 'package-lock.json'), 'changed');
      if (failure === 'untracked')
        await writeFile(path.join(root, 'new-source.ts'), 'uncommitted input');
      await expect(
        createCandidate(root, path.join(root, 'dist'), plan, '301', {
          repository: 'owner/site',
          runId: '101',
          jobId: 'build',
          attempt: 1,
          sourceCommit: failure === 'source' ? '1'.repeat(40) : source,
          eventName: failure === 'event' ? 'pull_request' : 'workflow_dispatch',
          ref: failure === 'branch' ? 'refs/heads/topic' : 'refs/heads/main',
        }),
      ).rejects.toThrow();
    },
  );
});
