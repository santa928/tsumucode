// @vitest-environment node
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type * as ParentModule from '../../../../scripts/release/v2/parent';

// This suite isolates the Git policy; captured-parent authentication is separately required.
vi.mock('../../../../scripts/release/v2/parent', async (importOriginal) => ({
  ...(await importOriginal<typeof ParentModule>()),
  validateCapturedBaseline: (input: unknown) => input,
}));
import { assertRetiredMovementParent } from '../../../../scripts/release/v2/retiredMovementFiles';

const exec = promisify(execFile);
const anchor = 'b9306eb3414e69a2068603cfdbf2706ebe4e9284';
const proof = {
  schemaVersion: 1,
  repository: 'santa928/tsumucode',
  deploymentId: '7699435659',
  sourceCommit: anchor,
  workflowHeadCommit: anchor,
  runId: '42929117936',
  tag: 'refs/tags/tsumucode-app-42929117936-7699435659',
  tagDigest: '005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b',
  artifactDigest: '7d0374e5807b4fa3c5ba819db1e56513f944577b21ee11b62bb16d2af0a75afa',
  artifactDigestFormat: 'canonical-dist-v1',
  projection: 'authoring',
  inventoryDigest: 'f66bdc9ce5fad39a76a22d79bb0f07b497efe7bdea1114278ecec80c47022310',
  publicContentDigest: '36b593f9e489346671b61c881237bf1e3e04fc8bf0d47e3a3b0c4569af9c6df9',
  publicFiles: 479,
  observedAt: '2026-11-11T03:00:00.000Z',
};
const names = ['retirement-v1.json', 'movement-eb2-v2.json', 'movement-v2.json'];
let root: string;
let descendant: string;
let unrelated: string;
let changed: string;
const env = {
  PATH: '/usr/bin:/bin',
  HOME: '/nonexistent',
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};
async function git(...args: string[]) {
  return (
    await exec('git', args, { cwd: root, env, encoding: 'utf8', timeout: 30000 })
  ).stdout.trim();
}
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'retired-parent-'));
  // Local upload-pack does not inherit GIT_CONFIG_COUNT settings from fetch.
  // Use only a temporary config with the exact source Git directory, never a
  // wildcard or the user's global config. The enclosing fixture removes it.
  const config = path.join(root, 'fixture-gitconfig');
  await exec(
    'git',
    ['config', '--file', config, '--add', 'safe.directory', path.join(process.cwd(), '.git')],
    {
      cwd: root,
      env,
      timeout: 30000,
    },
  );
  env.GIT_CONFIG_GLOBAL = config;
  await git('init', '-b', 'main');
  await git('fetch', '--no-tags', process.cwd(), anchor);
  await mkdir(path.join(root, 'docs/quality/movement-history'), { recursive: true });
  await git('read-tree', anchor);
  for (const name of names) {
    const relative = `docs/quality/movement-history/${name}`;
    await copyFile(relative, path.join(root, relative));
    const blob = await git('hash-object', '-w', relative);
    await git('update-index', '--add', '--cacheinfo', `100644,${blob},${relative}`);
  }
  const tree = await git('write-tree');
  descendant = await git('commit-tree', tree, '-p', anchor, '-m', 'Synthetic retirement');
  unrelated = await git('commit-tree', tree, '-m', 'Synthetic unrelated root');
  await writeFile(path.join(root, 'docs/quality/movement-history/retirement-v1.json'), 'changed');
  const changedBlob = await git(
    'hash-object',
    '-w',
    'docs/quality/movement-history/retirement-v1.json',
  );
  await git(
    'update-index',
    '--cacheinfo',
    `100644,${changedBlob},docs/quality/movement-history/retirement-v1.json`,
  );
  changed = await git(
    'commit-tree',
    await git('write-tree'),
    '-p',
    anchor,
    '-m',
    'Synthetic changed policy',
  );
  await copyFile(
    'docs/quality/movement-history/retirement-v1.json',
    path.join(root, 'docs/quality/movement-history/retirement-v1.json'),
  );
  await git('update-ref', 'HEAD', descendant);
  await mkdir(path.join(root, 'tests/fixtures/release-v2'), { recursive: true });
  await copyFile(
    'tests/fixtures/release-v2/b930-public-tag.object',
    path.join(root, 'tests/fixtures/release-v2/b930-public-tag.object'),
  );
}, 60000);
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

it('accepts the fixed tag with the anchor proof, not a different anchor', async () => {
  await expect(assertRetiredMovementParent(root, { proof })).resolves.toBeUndefined();
  await expect(
    assertRetiredMovementParent(root, { proof: { ...proof, deploymentId: '7699435660' } }),
  ).rejects.toThrow();
});
it('rejects working policy bytes absent from or changed in the candidate Source tree', async () => {
  await git('read-tree', descendant);
  await git('update-index', '--chmod=+x', 'docs/quality/movement-history/retirement-v1.json');
  const executable = await git(
    'commit-tree',
    await git('write-tree'),
    '-p',
    anchor,
    '-m',
    'Executable policy',
  );
  for (const head of [anchor, changed, executable]) {
    await git('update-ref', 'HEAD', head);
    try {
      await expect(assertRetiredMovementParent(root, { proof })).rejects.toThrow(
        'Retired movement parent is not verified',
      );
    } finally {
      await git('update-ref', 'HEAD', descendant);
    }
  }
  await git('read-tree', descendant);
});
it('accepts a descendant with exact retired policy and rejects unrelated, absent or altered history', async () => {
  await expect(
    assertRetiredMovementParent(root, { proof: { ...proof, sourceCommit: descendant } }),
  ).resolves.toBeUndefined();
  for (const sourceCommit of [unrelated, changed, 'f'.repeat(40)])
    await expect(
      assertRetiredMovementParent(root, { proof: { ...proof, sourceCommit } }),
    ).rejects.toThrow('Retired movement parent is not verified');
});
it('accepts the same descendant from a normal linked worktree without inheriting Git config', async () => {
  const linked = root + '-linked';
  await git('update-ref', 'HEAD', descendant);
  await git('worktree', 'add', '--detach', linked, descendant);
  const original = process.cwd();
  const originalGitDir = process.env.GIT_DIR;
  const originalWorkTree = process.env.GIT_WORK_TREE;
  try {
    process.chdir(linked);
    vi.stubEnv('GIT_DIR', path.join(linked, '.git-common/worktrees/other'));
    vi.stubEnv('GIT_WORK_TREE', linked);
    await expect(
      assertRetiredMovementParent(linked, { proof: { ...proof, sourceCommit: descendant } }),
    ).rejects.toThrow('Retired movement parent is not verified');
    vi.unstubAllEnvs();
    expect(process.env.GIT_DIR).toBe(originalGitDir);
    expect(process.env.GIT_WORK_TREE).toBe(originalWorkTree);
    // The positive case models a standalone worktree, not the outer compose
    // checkout. Do not reuse that outer checkout's repository selectors.
    vi.stubEnv('GIT_DIR', undefined);
    vi.stubEnv('GIT_WORK_TREE', undefined);
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'core.repositoryformatversion');
    vi.stubEnv('GIT_CONFIG_VALUE_0', '999');
    await expect(
      assertRetiredMovementParent(linked, { proof: { ...proof, sourceCommit: descendant } }),
    ).resolves.toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
    process.chdir(original);
    await git('worktree', 'remove', '--force', linked);
  }
}, 60000);
it.each(['info/grafts', 'objects/info/alternates'])(
  'rejects Git graph overrides: %s',
  async (relative) => {
    const target = path.join(root, '.git', relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, '');
    try {
      await expect(
        assertRetiredMovementParent(root, { proof: { ...proof, sourceCommit: descendant } }),
      ).rejects.toThrow('Retired movement parent is not verified');
    } finally {
      await rm(target);
    }
  },
);
it('rejects a shallow repository even if the commits are present', async () => {
  const target = path.join(root, '.git/shallow');
  await writeFile(target, anchor + '\n');
  try {
    await expect(
      assertRetiredMovementParent(root, { proof: { ...proof, sourceCommit: descendant } }),
    ).rejects.toThrow('Retired movement parent is not verified');
  } finally {
    await rm(target);
  }
});

it('does not inherit repository selectors, injected Git config or a shallow-file override', async () => {
  const fakeShallow = path.join(root, 'fake-shallow');
  await writeFile(fakeShallow, anchor + '\n');
  vi.stubEnv('GIT_DIR', path.join(root, 'not-a-repository'));
  vi.stubEnv('GIT_SHALLOW_FILE', fakeShallow);
  vi.stubEnv('GIT_CONFIG_COUNT', '1');
  vi.stubEnv('GIT_CONFIG_KEY_0', 'core.repositoryformatversion');
  vi.stubEnv('GIT_CONFIG_VALUE_0', '999');
  try {
    await expect(
      assertRetiredMovementParent(root, { proof: { ...proof, sourceCommit: descendant } }),
    ).resolves.toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
    await rm(fakeShallow);
  }
});
