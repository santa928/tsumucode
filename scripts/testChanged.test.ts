/** import依存へ現れないworkflow・公開台帳の必須検査を、実selectorの引数から確認する。 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const temporary: string[] = [];
const selector = path.resolve('scripts/testChanged.ts');
const tsx = path.resolve('node_modules/.bin/tsx');

/** 外側のGit metadataから隔離したfixtureで、npm実行対象だけを捕捉する。 */
function selectedTests(changed: string): readonly string[] {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tsumucode-test-selection-'));
  temporary.push(root);
  const repository = path.join(root, 'repo');
  const bin = path.join(root, 'bin');
  mkdirSync(repository);
  mkdirSync(bin);
  const files = [
    '.github/workflows/pages.yml',
    'content/next/release-history.yaml',
    'docs/quality/next-release-approval.yaml',
    'tests/pages-workflow.test.ts',
    'tests/unit/config/playwrightOutputIsolation.test.ts',
    'tests/content/course.test.ts',
    'tests/unit/release/typescriptRelease.test.ts',
    'tests/unit/release/nextRelease.test.ts',
    'scripts/testChanged.ts',
    'scripts/testChanged.test.ts',
  ];
  for (const file of files) {
    const target = path.join(repository, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'before\n');
  }
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repository, env: environment, encoding: 'utf8' });
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
  const base = git('rev-parse', 'HEAD').trim();
  writeFileSync(path.join(repository, changed), 'after\n');
  const calls = path.join(root, 'args.txt');
  const npm = path.join(bin, 'npm');
  writeFileSync(npm, '#!/bin/sh\nprintf "%s\\n" "$@" > "$CALLS"\n');
  chmodSync(npm, 0o700);
  const result = spawnSync(tsx, [selector], {
    cwd: repository,
    encoding: 'utf8',
    env: {
      ...environment,
      PATH: `${bin}${path.delimiter}${environment['PATH'] ?? ''}`,
      CALLS: calls,
      TEST_BASE_SHA: base,
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(calls, 'utf8').trim().split('\n');
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.each([
  '.github/workflows/pages.yml',
  'content/next/release-history.yaml',
  'docs/quality/next-release-approval.yaml',
])('%sの変更ではfs読込に依存する公開契約testも必須にする', (changed) => {
  const selected = selectedTests(changed);
  expect(selected).toContain('tests/unit/release/typescriptRelease.test.ts');
  expect(selected).toContain('tests/unit/release/nextRelease.test.ts');
});

it('selector自体の変更でも自身の回帰testを漏らさない', () => {
  expect(selectedTests('scripts/testChanged.ts')).toContain('scripts/testChanged.test.ts');
});
