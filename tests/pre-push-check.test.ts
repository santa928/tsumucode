/** 最終commit検査が失敗・対象不明・途中変更を成功へ読み替えないことを実CLIで確認する。 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporary: string[] = [];
const cli = path.resolve('scripts/checkBeforePush.ts');
const loader = import.meta.resolve('tsx');

/** 実Git repositoryと検証工程だけのstubを分離し、製品の検査実行とは数えない。 */
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tsumucode-prepush-'));
  temporary.push(root);
  const repository = path.join(root, 'repo');
  const bin = path.join(root, 'bin');
  mkdirSync(repository);
  mkdirSync(bin);
  const calls = path.join(root, 'calls.txt');
  writeFileSync(
    path.join(repository, 'package.json'),
    JSON.stringify({ engines: { node: process.versions.node } }),
  );
  writeFileSync(path.join(repository, 'package-lock.json'), JSON.stringify({ packages: {} }));
  const npm = path.join(bin, 'npm');
  writeFileSync(
    npm,
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\nif [ "$2" = "$FAIL_STAGE" ]; then exit 7; fi\nif [ "$2" = "$MUTATE_STAGE" ]; then printf "changed" > package.json; fi\n',
  );
  chmodSync(npm, 0o700);
  // Composeのread-only Git mountを、fixtureのGit操作へ引き継がない。
  const fixtureEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repository, encoding: 'utf8', env: fixtureEnvironment });
  git('init', '--quiet');
  git('add', '.');
  git(
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  );
  const head = git('rev-parse', 'HEAD').trim();
  const invoke = (args: string[], extra: Record<string, string> = {}) =>
    spawnSync(process.execPath, ['--import', loader, cli, ...args], {
      cwd: repository,
      encoding: 'utf8',
      env: {
        ...fixtureEnvironment,
        PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}`,
        CALLS: calls,
        ...extra,
      },
    });
  return { invoke, head, calls };
}

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('push前検証CLIの失敗伝播', () => {
  it('全工程成功時だけ検証したcommitとbaseを表示する', () => {
    const { invoke, head, calls } = fixture();
    const result = invoke([head]);
    expect(result.status).toBe(0);
    expect(readFileSync(calls, 'utf8')).toBe('run content:provenance\nrun check\n');
    expect(result.stdout).toContain('"status":"pre-push-check-passed"');
    expect(result.stdout).toContain(`"head":"${head}"`);
    expect(result.stdout).toContain(`"base":"${head}"`);
  });

  it('比較baseを省略すると検証成功を表示しない', () => {
    const { invoke } = fixture();
    const result = invoke([]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('pre-push-check-passed');
    expect(result.stderr).toContain('Usage:');
  });

  it('工程の失敗codeを維持し、後続工程へ進めない', () => {
    const { invoke, head, calls } = fixture();
    const result = invoke([head], { FAIL_STAGE: 'content:provenance' });
    expect(result.status).toBe(7);
    expect(readFileSync(calls, 'utf8')).toBe('run content:provenance\n');
    expect(result.stdout).not.toContain('pre-push-check-passed');
  });

  it('工程が成功しても検証中にSourceが変わった場合は拒否する', () => {
    const { invoke, head } = fixture();
    const result = invoke([head], { MUTATE_STAGE: 'check' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('作業ツリーをclean');
    expect(result.stdout).not.toContain('pre-push-check-passed');
  });
});
