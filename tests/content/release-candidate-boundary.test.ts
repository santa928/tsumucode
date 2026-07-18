// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { hashReleaseCandidateTree } from '../../scripts/release/releaseHashes';
import { assertProductUnchanged } from '../../scripts/release/verifyReleaseApproval';

const execFileAsync = promisify(execFile);
const temporaryGitRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryGitRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

/** Composeから継承したGit変数を除外し、一時RepositoryでGitを実行する。 */
async function git(repositoryRoot: string, arguments_: readonly string[]): Promise<string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  const { stdout } = await execFileAsync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: environment,
  });
  return stdout.trim();
}

/** Production APIのGit subprocessを一時Repositoryへ固定してcallbackを実行する。 */
async function withGitEnvironment<T>(
  repositoryRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const inheritedGitDirectory = process.env['GIT_DIR'];
  const inheritedWorkTree = process.env['GIT_WORK_TREE'];
  process.env['GIT_DIR'] = path.join(repositoryRoot, '.git');
  process.env['GIT_WORK_TREE'] = repositoryRoot;
  try {
    return await operation();
  } finally {
    if (inheritedGitDirectory === undefined) Reflect.deleteProperty(process.env, 'GIT_DIR');
    else process.env['GIT_DIR'] = inheritedGitDirectory;
    if (inheritedWorkTree === undefined) Reflect.deleteProperty(process.env, 'GIT_WORK_TREE');
    else process.env['GIT_WORK_TREE'] = inheritedWorkTree;
  }
}

describe('release candidate Product boundary', () => {
  it('旧Bundle fixtureをcandidate treeへ含め、承認source後の差し替えを拒否する', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tsumucode-release-candidate-'));
    temporaryGitRoots.push(root);
    await git(root, ['init']);
    await git(root, ['config', 'user.name', 'TsumuCode Test']);
    await git(root, ['config', 'user.email', 'test@example.invalid']);
    const fixtureDirectory = path.join(root, 'tests', 'fixtures', 'progress');
    await mkdir(fixtureDirectory, { recursive: true });
    const fixturePath = path.join(fixtureDirectory, 'previous-release-bundle.json');
    const approvedFixture = new TextEncoder().encode('{"revision":1}\n');
    await writeFile(path.join(root, 'README.md'), 'release fixture\n');
    await writeFile(fixturePath, approvedFixture);
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', 'Candidate source']);
    const sourceCommit = await git(root, ['rev-parse', 'HEAD']);

    await withGitEnvironment(root, async () => {
      const approvedTreeHash = await hashReleaseCandidateTree(root);
      await writeFile(fixturePath, '{"revision":2}\n');
      await expect(hashReleaseCandidateTree(root)).resolves.not.toBe(approvedTreeHash);
      await expect(
        hashReleaseCandidateTree(
          root,
          new Map([['tests/fixtures/progress/previous-release-bundle.json', approvedFixture]]),
        ),
      ).resolves.toBe(approvedTreeHash);
      await git(root, ['add', 'tests/fixtures/progress/previous-release-bundle.json']);
      await git(root, ['commit', '-m', 'Fixture差し替え']);
      const workflowHead = await git(root, ['rev-parse', 'HEAD']);
      await expect(assertProductUnchanged(root, sourceCommit, workflowHead)).rejects.toThrow(
        /Product treeが変更/iu,
      );
    });
  });
});
