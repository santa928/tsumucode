// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { assertAnchorTrackedTree } from '../../../../scripts/release/v2/anchorTrackedTree';
import { gitFixtureEnvironment } from './gitFixture';

const temporary: string[] = [];
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'anchor-tree-'));
  temporary.push(root);
  const env = gitFixtureEnvironment();
  execFileSync('git', ['init', '--quiet', root], { env });
  mkdirSync(path.join(root, 'nested'));
  writeFileSync(path.join(root, 'nested', 'multi-chunk.bin'), Buffer.alloc(130000, 42));
  writeFileSync(path.join(root, 'regular.txt'), 'value');
  writeFileSync(path.join(root, 'executable.sh'), '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(root, 'executable.sh'), 0o755);
  execFileSync('git', ['add', '.'], { cwd: root, env });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ],
    { cwd: root, env },
  );
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    env,
    encoding: 'utf8',
  }).trim();
  return { root, commit };
}

it('matches fixed tracked bytes, including multiple chunks and executable mode', async () => {
  const { root, commit } = repository();
  await expect(assertAnchorTrackedTree(root, commit)).resolves.toBeUndefined();
});

it('rejects a same-size tracked byte change', async () => {
  const { root, commit } = repository();
  writeFileSync(path.join(root, 'regular.txt'), 'other');
  await expect(assertAnchorTrackedTree(root, commit)).rejects.toThrow(
    'Verifier tracked file bytes differ',
  );
});

it('rejects a missing tracked file', async () => {
  const { root, commit } = repository();
  unlinkSync(path.join(root, 'regular.txt'));
  await expect(assertAnchorTrackedTree(root, commit)).rejects.toThrow(
    'Verifier tracked path missing',
  );
});

it('rejects a tracked file with another hard link', async () => {
  const { root, commit } = repository();
  linkSync(path.join(root, 'regular.txt'), path.join(root, 'alias'));
  await expect(assertAnchorTrackedTree(root, commit)).rejects.toThrow(
    'Verifier tracked file has multiple hardlinks',
  );
});

it('rejects replacing a tracked file with a symlink', async () => {
  const { root, commit } = repository();
  const file = path.join(root, 'regular.txt');
  unlinkSync(file);
  symlinkSync('executable.sh', file);
  await expect(assertAnchorTrackedTree(root, commit)).rejects.toThrow(
    'Verifier tracked path is not a regular file',
  );
});

it('rejects replacing a tracked parent directory with a symlink', async () => {
  const { root, commit } = repository();
  const outside = mkdtempSync(path.join(os.tmpdir(), 'anchor-tree-outside-'));
  temporary.push(outside);
  writeFileSync(path.join(outside, 'multi-chunk.bin'), Buffer.alloc(130000, 42));
  rmSync(path.join(root, 'nested'), { recursive: true });
  symlinkSync(outside, path.join(root, 'nested'));
  await expect(assertAnchorTrackedTree(root, commit)).rejects.toThrow(
    'Verifier tracked path is not a regular file',
  );
});

it('rejects a tracked executable-mode change', async () => {
  const { root, commit } = repository();
  chmodSync(path.join(root, 'executable.sh'), 0o644);
  await expect(assertAnchorTrackedTree(root, commit)).rejects.toThrow(
    'Verifier tracked file identity differs',
  );
});
