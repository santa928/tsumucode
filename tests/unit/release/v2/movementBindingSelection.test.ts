// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  MovementDeclarationSchema,
  readMovementDeclaration,
} from '../../../../scripts/release/v2/movement';
import { readMovementBaselineProofs } from '../../../../scripts/release/v2/movementBaseline';
import { hashArtifact, hashValue } from '../../../../scripts/release/v2/identity';
import { compileContent } from '../../../../scripts/content/compile';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import { releaseFixture } from './releaseFixture';

const exec = promisify(execFile);
const eb2 = 'eb2fe6f8e06409569f173efb2fe6275c46a535cf';
const roots: string[] = [];
const controlledGitEnvironment = (key: string) =>
  key.startsWith('GIT_') || ['HOME', 'PATH', 'LC_ALL', 'XDG_CONFIG_HOME'].includes(key);
let savedGitEnvironment: [string, string | undefined][] = [];
beforeEach(async () => {
  savedGitEnvironment = Object.entries(process.env).filter(([key]) =>
    controlledGitEnvironment(key),
  );
  const home = await mkdtemp(path.join(os.tmpdir(), 'movement-binding-git-env-'));
  roots.push(home);
  await mkdir(path.join(home, 'empty-git-template'));
  for (const key of Object.keys(process.env))
    if (controlledGitEnvironment(key)) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, isolatedGitEnvironment(home));
});
afterEach(async () => {
  for (const key of Object.keys(process.env))
    if (controlledGitEnvironment(key)) Reflect.deleteProperty(process.env, key);
  for (const [key, value] of savedGitEnvironment) if (value !== undefined) process.env[key] = value;
  savedGitEnvironment = [];
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movement-binding-selection-'));
  roots.push(root);
  await mkdir(path.join(root, 'docs/quality'), { recursive: true });
  return root;
}

function gitAt(root: string) {
  const ignored = new Set([
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_NAMESPACE',
  ]);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !ignored.has(name)),
  );
  return async (...args: string[]) =>
    (await exec('git', args, { cwd: root, env, encoding: 'utf8' })).stdout.trim();
}

function isolatedGitEnvironment(home: string) {
  return {
    PATH: '/usr/bin:/bin',
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, 'xdg'),
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: '4',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: '/dev/null',
    GIT_CONFIG_KEY_1: 'core.fsmonitor',
    GIT_CONFIG_VALUE_1: 'false',
    GIT_CONFIG_KEY_2: 'init.templateDir',
    GIT_CONFIG_VALUE_2: path.join(home, 'empty-git-template'),
    GIT_CONFIG_KEY_3: 'safe.directory',
    GIT_CONFIG_VALUE_3: process.cwd(),
    GIT_TERMINAL_PROMPT: '0',
  };
}

function isolatedGitAt(root: string, home: string) {
  const env = isolatedGitEnvironment(home);
  return async (...args: string[]) =>
    (await exec('/usr/bin/git', args, { cwd: root, env, encoding: 'utf8' })).stdout.trim();
}

async function declarationRoot() {
  const root = await temporaryRoot();
  const git = gitAt(root);
  await git('init', '-b', 'main');
  await git(
    '-c',
    'user.name=Unit Fixture',
    '-c',
    'user.email=unit@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'synthetic binding source',
  );
  // 読込選択の合成protocol。実際の新しい承認や公開根拠としては使わない。
  const declaration = MovementDeclarationSchema.parse(
    JSON.parse(await readFile('docs/quality/movement-v2.json', 'utf8')),
  );
  declaration.body.candidateContentCommit = await git('rev-parse', 'HEAD');
  return { root, declaration };
}

it('eb2用の宣言を明示的に優先し、旧宣言の元bytesは保持する', async () => {
  const { root, declaration } = await declarationRoot();
  const previous = JSON.stringify(declaration);
  await writeFile(path.join(root, 'docs/quality/movement-v2.json'), previous);
  const current = structuredClone(declaration);
  current.body.baseline.sourceCommit = eb2;
  await writeFile(path.join(root, 'docs/quality/movement-eb2-v2.json'), JSON.stringify(current));
  expect(await readMovementDeclaration(root)).toEqual(current);
  expect(await readFile(path.join(root, 'docs/quality/movement-v2.json'), 'utf8')).toBe(previous);
});

it('新宣言が壊れていても旧宣言へ戻して成功させない', async () => {
  const { root, declaration } = await declarationRoot();
  await writeFile(path.join(root, 'docs/quality/movement-v2.json'), JSON.stringify(declaration));
  await writeFile(path.join(root, 'docs/quality/movement-eb2-v2.json'), '{broken');
  await expect(readMovementDeclaration(root)).rejects.toThrow();
});

it('新宣言が無い旧checkoutは従来宣言を読める', async () => {
  const { root, declaration } = await declarationRoot();
  await writeFile(path.join(root, 'docs/quality/movement-v2.json'), JSON.stringify(declaration));
  expect(await readMovementDeclaration(root)).toEqual(declaration);
});

it('新宣言でも存在しないcandidateContentCommitを拒否する', async () => {
  const { root, declaration } = await declarationRoot();
  declaration.body.candidateContentCommit = '9'.repeat(40);
  await writeFile(
    path.join(root, 'docs/quality/movement-eb2-v2.json'),
    JSON.stringify(declaration),
  );
  await expect(readMovementDeclaration(root)).rejects.toThrow();
});

it('eb2の固定後続だけを許し、各教材とreceiptの追加変更を拒否する', async () => {
  const source = 'c01e02c8de2ee4914a94992a30657be8e6bb223d';
  const digest = 'f66bdc9ce5fad39a76a22d79bb0f07b497efe7bdea1114278ecec80c47022310';
  const previousDigest = '8fd703f3db5754e38639f7efd5959c78267d9f0236c03360b8eba65ab83eac26';
  const root = await temporaryRoot();
  const git = gitAt(root);
  const objects = (
    await exec('git', ['rev-parse', '--path-format=absolute', '--git-path', 'objects'])
  ).stdout.trim();
  await git('init', '-b', 'main');
  await writeFile(path.join(root, '.git/objects/info/alternates'), objects + '\n');
  const declarationPath = 'docs/quality/movement-eb2-v2.json';
  const original = await readFile(declarationPath, 'utf8');
  await git('update-ref', 'HEAD', source);
  await git('read-tree', '--reset', '-u', source);
  expect(await readMovementDeclaration(root, digest)).toEqual(JSON.parse(original));
  await expect(readMovementDeclaration(root, previousDigest)).rejects.toThrow();
  await expect(readMovementDeclaration(root, '0'.repeat(64))).rejects.toThrow();

  const receipts = 'docs/quality/content-v2-receipts.json';
  await writeFile(path.join(root, receipts), '{}');
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow(/dirty content or receipts/u);
  await git('update-index', '--assume-unchanged', receipts);
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow(/receipt bytes differ/u);
  await git('update-index', '--no-assume-unchanged', receipts);
  await git('checkout', '--', receipts);

  const changePath = path.join(root, 'changed');
  await writeFile(changePath, 'unapproved change');
  const changedBlob = await git('hash-object', '-w', changePath);
  const courses = (await git('ls-tree', '-d', '--name-only', source + ':content')).split('\n');
  for (const changedPath of [
    ...courses.map((id) => 'content/' + id + '/unexpected.md'),
    receipts,
  ]) {
    await git('read-tree', source);
    await git('update-index', '--add', '--cacheinfo', `100644,${changedBlob},${changedPath}`);
    const tree = await git('write-tree');
    const changed = await git(
      '-c',
      'user.name=Unit Fixture',
      '-c',
      'user.email=unit@example.invalid',
      'commit-tree',
      tree,
      '-p',
      source,
      '-m',
      'unapproved change',
    );
    await git('update-ref', 'HEAD', changed);
    await expect(readMovementDeclaration(root, digest), changedPath).rejects.toThrow();
  }
  expect(await readFile(path.join(root, declarationPath), 'utf8')).toBe(original);
});

it('承認済みPath後続を固定treeでのみ許し、不正な作業状態を拒否する', async () => {
  const source = '2a0dfa3a196cca736c6c7b6129e0cacb1d263d20';
  const digest = 'f66bdc9ce5fad39a76a22d79bb0f07b497efe7bdea1114278ecec80c47022310';
  const root = await temporaryRoot();
  const git = gitAt(root);
  const objects = (
    await exec('git', ['rev-parse', '--path-format=absolute', '--git-path', 'objects'])
  ).stdout.trim();
  await git('init', '-b', 'main');
  await writeFile(path.join(root, '.git/objects/info/alternates'), objects + '\n');
  await git('update-ref', 'HEAD', source);
  await git('read-tree', '--reset', '-u', source);
  const beforeRss = process.memoryUsage.rss();
  const started = performance.now();
  const measured = await hashArtifact(path.join(root, 'content'), { rejectEmptyDirectories: true });
  const elapsedMs = Math.round(performance.now() - started);
  const afterRss = process.memoryUsage.rss();
  const peakRss = process.resourceUsage().maxRSS;
  expect(measured.files).toHaveLength(5018);
  expect(measured.digest).toBe('72fdaf396094b6ca7f3a993a7656f3305db89a5a40d5855bd4f6693c080b3fe9');
  process.stdout.write(
    `movement-closure files=5018 duration-ms=${String(elapsedMs)} process-rss-before-bytes=${String(beforeRss)} process-rss-after-bytes=${String(afterRss)} process-maxrss-kib=${String(peakRss)}\n`,
  );
  const expected = MovementDeclarationSchema.parse(
    JSON.parse(await readFile(path.join(root, 'docs/quality/movement-eb2-v2.json'), 'utf8')),
  );
  expect(await readMovementDeclaration(root, digest)).toEqual(expected);
  await expect(readMovementDeclaration(root, '0'.repeat(64))).rejects.toThrow();
  await expect(
    readMovementDeclaration(
      root,
      'bf5b4a053e405301728761e1488fbadf600f95a372cd997943734b35e75084dc',
    ),
  ).rejects.toThrow();
  const target = 'content/learning-paths/python-basics.yaml';
  const original = await readFile(path.join(root, target));
  await writeFile(path.join(root, target), 'tampered');
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await git('update-index', '--assume-unchanged', target);
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await git('update-index', '--no-assume-unchanged', target);
  await writeFile(path.join(root, target), original);
  await git('update-index', '--skip-worktree', target);
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await git('update-index', '--no-skip-worktree', target);
  await git('config', 'core.filemode', 'false');
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await git('config', 'core.filemode', 'true');
  await writeFile(path.join(root, 'content/unapproved-test-file'), 'x');
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await rm(path.join(root, 'content/unapproved-test-file'));
  const hidden = 'content/learning-paths/unapproved-extra.yaml';
  const fixedClosure = (await hashArtifact(path.join(root, 'content'))).digest;
  await mkdir(path.join(root, '.git/info'), { recursive: true });
  await writeFile(path.join(root, '.git/info/exclude'), hidden + '\n');
  await writeFile(path.join(root, hidden), 'schemaVersion: 1\n');
  expect((await hashArtifact(path.join(root, 'content'))).digest).not.toBe(fixedClosure);
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await rm(path.join(root, hidden));
  await writeFile(path.join(root, '.git/info/exclude'), '');
  const globalIgnore = path.join(root, '.git/global-excludes');
  await writeFile(globalIgnore, hidden + '\n');
  await git('config', 'core.excludesFile', globalIgnore);
  await writeFile(path.join(root, hidden), 'schemaVersion: 1\n');
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await rm(path.join(root, hidden));
  await git('config', '--unset', 'core.excludesFile');
  const caseDirectory = path.join(root, 'content/LEARNING-PATHS');
  let distinctCaseDirectory = true;
  try {
    await mkdir(caseDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    distinctCaseDirectory = false;
  }
  if (process.platform === 'linux') expect(distinctCaseDirectory).toBe(true);
  if (distinctCaseDirectory) {
    await rm(caseDirectory, { recursive: true });
    await git('config', 'core.ignorecase', 'true');
    const caseFile = path.join(root, 'content/learning-paths/Python-basics.yaml');
    await writeFile(caseFile, 'schemaVersion: 1\n');
    expect(await git('status', '--porcelain', '--untracked-files=all', '--', 'content')).toBe('');
    await expect(readMovementDeclaration(root, digest)).rejects.toThrow(/content closure differs/u);
    await rm(caseFile);
  }
  const emptyDirectory = path.join(root, 'content/learning-paths/unapproved-empty');
  await mkdir(emptyDirectory);
  expect((await hashArtifact(path.join(root, 'content'))).digest).toBe(fixedClosure);
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow(/empty directory/u);
  await rm(emptyDirectory, { recursive: true });
  await chmod(path.join(root, target), 0o755);
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await chmod(path.join(root, target), 0o644);
  const receipt = 'docs/quality/content-v2-receipts.json';
  const oldReceipt = await readFile(path.join(root, receipt));
  await writeFile(path.join(root, receipt), '{}');
  await git('update-index', '--assume-unchanged', receipt);
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await git('update-index', '--no-assume-unchanged', receipt);
  await writeFile(path.join(root, receipt), oldReceipt);
  await rm(path.join(root, target));
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
  await writeFile(path.join(root, target), original);
  await git(
    'update-index',
    '--add',
    '--cacheinfo',
    '100755,28df52e8940072b3b57cf14f283f848ffebb16b1,' + target,
  );
  const changedTree = await git('write-tree');
  const changedCommit = await git(
    '-c',
    'user.name=Unit Fixture',
    '-c',
    'user.email=unit@example.invalid',
    'commit-tree',
    changedTree,
    '-p',
    source,
    '-m',
    'unapproved mode change',
  );
  await git('update-ref', 'HEAD', changedCommit);
  await expect(readMovementDeclaration(root, digest)).rejects.toThrow();
}, 60000);

const publicationSource = '5d2bf90bf2197c3b40177a151c2a7837fe554e7f';
const publicationDigest = 'bf5b4a053e405301728761e1488fbadf600f95a372cd997943734b35e75084dc';

async function publicationFixture() {
  const root = await temporaryRoot();
  await mkdir(path.join(root, 'empty-git-template'));
  const git = isolatedGitAt(root, root);
  const objects = await isolatedGitAt(process.cwd(), root)(
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'objects',
  );
  const originalEnvironment = Object.entries(process.env).filter(([key]) =>
    controlledGitEnvironment(key),
  );
  const trap = path.join(root, 'unapproved-worktree');
  await mkdir(trap);
  const hostileTemplate = path.join(root, 'unapproved-template');
  await mkdir(path.join(hostileTemplate, 'hooks'), { recursive: true });
  await writeFile(
    path.join(hostileTemplate, 'hooks/reference-transaction'),
    '#!/bin/sh\nexit 99\n',
    { mode: 0o755 },
  );
  const globalConfig = path.join(root, 'unapproved-global-config');
  await writeFile(
    globalConfig,
    `[core]\n\tworktree = ${trap}\n[init]\n\ttemplateDir = ${hostileTemplate}\n`,
  );
  try {
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    process.env.GIT_CONFIG_COUNT = '1';
    process.env.GIT_CONFIG_KEY_0 = 'core.worktree';
    process.env.GIT_CONFIG_VALUE_0 = trap;
    await git('init', '-b', 'main');
    expect(await git('rev-parse', '--show-toplevel')).toBe(root);
    await expect(
      readFile(path.join(root, '.git/hooks/reference-transaction')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    for (const key of Object.keys(process.env))
      if (controlledGitEnvironment(key)) Reflect.deleteProperty(process.env, key);
    for (const [key, value] of originalEnvironment)
      if (value !== undefined) process.env[key] = value;
  }
  await writeFile(path.join(root, '.git/objects/info/alternates'), objects + '\n');
  await git('update-ref', 'HEAD', publicationSource);
  await git('read-tree', '--reset', '-u', publicationSource);
  const declarationPath = 'docs/quality/movement-eb2-v2.json';
  const originalDeclaration = await readFile(path.join(root, declarationPath), 'utf8');
  const expectAccepted = async () => {
    expect(await readMovementDeclaration(root, publicationDigest)).toEqual(
      JSON.parse(originalDeclaration),
    );
  };
  await expectAccepted();
  return { root, git, expectAccepted, declarationPath, originalDeclaration };
}

it('実践とOOP候補の全inventoryとcontent closureを固定する', async () => {
  const { root, expectAccepted } = await publicationFixture();
  const compiled = await compileContent({
    sourceRoot: path.resolve('content'),
    outputRoot: path.join(root, 'generated/content'),
    checkOnly: true,
  });
  expect(hashValue(buildInventory(compiled.compilations))).toBe(publicationDigest);
  const closure = await hashArtifact(path.join(root, 'content'), { rejectEmptyDirectories: true });
  expect(closure.files).toHaveLength(5018);
  expect(closure.digest).toBe('f13b1f3636dcdf3db291f911c6af8ad78352c0482462cc4b28ea1ffb52db63f1');
  await expect(readMovementDeclaration(root, '0'.repeat(64))).rejects.toThrow();
  await expect(
    readMovementDeclaration(
      root,
      'f66bdc9ce5fad39a76a22d79bb0f07b497efe7bdea1114278ecec80c47022310',
    ),
  ).rejects.toThrow();
  await expectAccepted();
}, 60000);

it('固定3 path・receipt・他のtracked教材の改変を拒否し復元後は受け入れる', async () => {
  const { root, git, expectAccepted, declarationPath, originalDeclaration } =
    await publicationFixture();
  for (const target of [
    'content/learning-paths/python-basics.yaml',
    'content/python-practice/course.yaml',
    'content/python-oop/course.yaml',
    'docs/quality/content-v2-receipts.json',
    'content/python-basics/course.yaml',
  ]) {
    const file = path.join(root, target);
    const original = await readFile(file);
    await writeFile(file, 'unapproved change');
    await expect(readMovementDeclaration(root, publicationDigest), target).rejects.toThrow();
    await git('update-index', '--assume-unchanged', target);
    await expect(
      readMovementDeclaration(root, publicationDigest),
      target + ' hidden',
    ).rejects.toThrow();
    await git('update-index', '--no-assume-unchanged', target);
    await writeFile(file, original);
    await expectAccepted();
  }
  expect(await readFile(path.join(root, declarationPath), 'utf8')).toBe(originalDeclaration);
}, 60000);

it('index・ignored・空dir・symlinkの改変を拒否し復元後は受け入れる', async () => {
  const { root, git, expectAccepted } = await publicationFixture();
  const tracked = 'content/python-basics/course.yaml';
  const original = await readFile(path.join(root, tracked));
  await writeFile(path.join(root, tracked), 'unapproved index change');
  await git('add', '--', tracked);
  await writeFile(path.join(root, tracked), original);
  await expect(readMovementDeclaration(root, publicationDigest)).rejects.toThrow();
  await git('reset', '--', tracked);
  await expectAccepted();
  const excluded = 'content/learning-paths/unapproved-extra.yaml';
  await mkdir(path.join(root, '.git/info'), { recursive: true });
  await writeFile(path.join(root, '.git/info/exclude'), excluded + '\n');
  await writeFile(path.join(root, excluded), 'unapproved');
  await expect(readMovementDeclaration(root, publicationDigest)).rejects.toThrow();
  await rm(path.join(root, excluded));
  await writeFile(path.join(root, '.git/info/exclude'), '');
  await expectAccepted();
  const empty = path.join(root, 'content/learning-paths/unapproved-empty');
  await mkdir(empty);
  await expect(readMovementDeclaration(root, publicationDigest)).rejects.toThrow();
  await rm(empty, { recursive: true });
  await expectAccepted();
  const link = path.join(root, 'content/learning-paths/unapproved-link');
  await symlink('python-basics.yaml', link);
  await expect(readMovementDeclaration(root, publicationDigest)).rejects.toThrow();
  await rm(link);
  await expectAccepted();
}, 60000);

it('隠しindex・filemode設定・3対象のmode改変を拒否し復元後は受け入れる', async () => {
  const { root, git, expectAccepted } = await publicationFixture();
  const target = 'content/python-practice/course.yaml';
  await git('update-index', '--skip-worktree', target);
  await expect(readMovementDeclaration(root, publicationDigest)).rejects.toThrow();
  await git('update-index', '--no-skip-worktree', target);
  await expectAccepted();
  await git('config', 'core.filemode', 'false');
  await expect(readMovementDeclaration(root, publicationDigest)).rejects.toThrow();
  await git('config', 'core.filemode', 'true');
  await expectAccepted();
  for (const modePath of [
    'content/learning-paths/python-basics.yaml',
    'content/python-practice/course.yaml',
    'content/python-oop/course.yaml',
  ]) {
    await chmod(path.join(root, modePath), 0o755);
    await expect(readMovementDeclaration(root, publicationDigest)).rejects.toThrow();
    await chmod(path.join(root, modePath), 0o644);
    await expectAccepted();
  }
}, 60000);

it('eb2 bindingに対応する元proofだけを選び、再captureは時刻だけの差を許す', async () => {
  const root = await temporaryRoot();
  const row = releaseFixture().capturedBaseline;
  const original = { ...row.proof, sourceCommit: eb2 };
  const current = { ...original, observedAt: '2026-11-06T10:00:00Z' };
  const binding = {
    deploymentId: original.deploymentId,
    sourceCommit: eb2,
    sourceRecordDigest: hashValue(original),
    inventoryDigest: original.inventoryDigest,
  };
  const baseline = { ...row.baseline, sourceCommit: eb2, sourceRecordDigest: hashValue(current) };
  await writeFile(
    path.join(root, 'docs/quality/movement-baseline-proof-v2.json'),
    JSON.stringify(row.proof),
  );
  await writeFile(
    path.join(root, 'docs/quality/movement-eb2-baseline-proof-v2.json'),
    JSON.stringify(original),
  );
  expect(await readMovementBaselineProofs(root, binding, baseline, current)).toEqual({
    original,
    current,
  });
  const altered = { ...current, publicFiles: current.publicFiles + 1 };
  await expect(
    readMovementBaselineProofs(
      root,
      binding,
      { ...baseline, sourceRecordDigest: hashValue(altered) },
      altered,
    ),
  ).rejects.toThrow(/beyond observedAt/u);
});
