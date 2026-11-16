import { lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { readBoundedRegularFile } from './boundedFile';
import { hashBytes, repositoryEnvironment } from './identity';
import { validateCapturedBaseline } from './parent';
import { assertFixedPythonFirstAnchor } from './pythonFirstAnchorIdentity';
import { isolatedAnchorGitEnvironment } from './anchorProcessSafety';

const exec = promisify(execFile);
const anchorSource = 'b9306eb3414e69a2068603cfdbf2706ebe4e9284';
const files = [
  ['retirement-v1.json', 'fe9969227edce15a66b600491294e788e2e461ef33be3e0a17099229b6a8698b'],
  ['movement-eb2-v2.json', 'f128cace0b4ab2a0e57a518daf7fe8d0f5fdd3a98a6b2128cbf77f41583df1b8'],
  ['movement-v2.json', '539ed1c598d02661275500e7fa222d4649e44c1a13e8b606924cb9ee6e8f55d3'],
] as const;

/** Draft-only evidence check; calling it does not authenticate a parent or authorize a release. */
export async function assertRetiredMovementFiles(root: string) {
  try {
    for (const relative of ['docs', 'docs/quality', 'docs/quality/movement-history']) {
      const directory = await lstat(path.join(root, relative));
      if (!directory.isDirectory() || directory.isSymbolicLink())
        throw Error('Invalid retired movement directory');
    }
    for (const [name, digest] of files) {
      const file = path.join(root, 'docs/quality/movement-history', name);
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o111) !== 0)
        throw Error('Invalid retired movement file');
      if (hashBytes(await readBoundedRegularFile(file, 4 * 1024 * 1024)) !== digest)
        throw Error('Retired movement file differs');
    }
  } catch {
    throw Error('Retired movement evidence is missing or changed');
  }
}

/**
 * Caller must independently capture the actual verified deployment and recheck it at admission.
 * This checks the retired Source policy; it neither proves historical approval nor deploys.
 */
export async function assertRetiredMovementParent(root: string, capturedInput: unknown) {
  await assertRetiredMovementFiles(root);
  const { proof } = validateCapturedBaseline(capturedInput);
  try {
    const metadata = await lstat(path.join(root, '.git'));
    if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile()))
      throw Error('Unverified Git metadata');
    // Use exactly the repository selectors accepted by the existing release
    // checkout logic. Never copy caller-supplied Git config or object overrides.
    const existing = await repositoryEnvironment(root);
    let selectors: NodeJS.ProcessEnv = {};
    if (
      metadata.isFile() &&
      (existing.GIT_DIR !== undefined || existing.GIT_WORK_TREE !== undefined)
    ) {
      const pointer = (await readBoundedRegularFile(path.join(root, '.git'), 4096))
        .toString('utf8')
        .trim();
      const match = /^gitdir: (\/.*\/worktrees\/([^/]+))$/u.exec(pointer);
      if (!match || match[2] === '.' || match[2] === '..') throw Error('Invalid linked worktree');
      const common = path.join(root, '.git-common');
      const worktrees = path.join(common, 'worktrees');
      const admin = path.join(worktrees, match[2]!);
      if (existing.GIT_DIR !== admin || existing.GIT_WORK_TREE !== path.resolve(root))
        throw Error('Different linked worktree');
      for (const directory of [common, worktrees, admin]) {
        const info = await lstat(directory);
        if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Invalid Git directory');
      }
      if (
        (await readBoundedRegularFile(path.join(admin, 'commondir'), 4096))
          .toString('utf8')
          .trim() !== '../..'
      )
        throw Error('Invalid Git common directory');
      selectors = { GIT_DIR: admin, GIT_WORK_TREE: path.resolve(root) };
    }
    const environment = {
      ...isolatedAnchorGitEnvironment(),
      ...selectors,
      GIT_NO_LAZY_FETCH: '1',
      // The existing compose runner uses the same fixed safe.directory value:
      // its root user may read a checkout owned by the GitHub runner user.
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: path.resolve(root),
    };
    const git = async (...args: string[]) =>
      (
        await exec('git', args, {
          cwd: root,
          env: environment,
          encoding: 'buffer',
          timeout: 10000,
          maxBuffer: 4 * 1024 * 1024,
        })
      ).stdout;
    if (
      path.resolve((await git('rev-parse', '--show-toplevel')).toString('utf8').trim()) !==
      path.resolve(root)
    )
      throw Error('Git worktree differs');
    if ((await git('rev-parse', '--is-shallow-repository')).toString('utf8').trim() !== 'false')
      throw Error('Shallow history');
    for (const name of ['info/grafts', 'objects/info/alternates']) {
      const gitPath = (await git('rev-parse', '--git-path', name)).toString('utf8').trim();
      try {
        await lstat(path.resolve(root, gitPath));
        throw Error('Untrusted Git graph');
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    // The working bytes must also be committed in this candidate's Source.
    // An ignored or otherwise untracked file cannot supply the retirement policy.
    for (const [name, digest] of files) {
      const relative = `docs/quality/movement-history/${name}`;
      const entry = (await git('ls-tree', 'HEAD', '--', relative)).toString('utf8');
      if (!/^100644 blob [a-f0-9]{40}\t/u.test(entry)) throw Error('Invalid Source policy file');
      if (hashBytes(await git('show', `HEAD:${relative}`)) !== digest)
        throw Error('Source policy differs');
    }
    if (proof.sourceCommit === anchorSource) {
      const tag = await readBoundedRegularFile(
        path.join(root, 'tests/fixtures/release-v2/b930-public-tag.object'),
        16 * 1024,
      );
      assertFixedPythonFirstAnchor(proof, tag);
      return;
    }
    await git('cat-file', '-e', `${anchorSource}^{commit}`);
    await git('cat-file', '-e', `${proof.sourceCommit}^{commit}`);
    await git('merge-base', '--is-ancestor', anchorSource, proof.sourceCommit);
    for (const [name, digest] of files) {
      const relative = `docs/quality/movement-history/${name}`;
      const entry = (await git('ls-tree', proof.sourceCommit, '--', relative)).toString('utf8');
      if (!/^100644 blob [a-f0-9]{40}\t/u.test(entry)) throw Error('Invalid parent policy file');
      if (hashBytes(await git('show', `${proof.sourceCommit}:${relative}`)) !== digest)
        throw Error('Parent policy differs');
    }
  } catch {
    throw Error('Retired movement parent is not verified');
  }
}
