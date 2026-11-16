import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertCandidateContentSource, resolveCandidateSource } from '../unit/release/v2/candidateContentSource.mjs';

test('CI requires its event Source while local mode may resolve HEAD', () => {
  const fallback = () => 'local-head';
  assert.equal(resolveCandidateSource({}, fallback), 'local-head');
  assert.equal(resolveCandidateSource({ TSUMUCODE_CI_SOURCE_REQUIRED: '1', TSUMUCODE_CI_SOURCE_SHA: 'event-source' }, fallback), 'event-source');
  assert.throws(() => resolveCandidateSource({ TSUMUCODE_CI_SOURCE_REQUIRED: '1' }, fallback), /Missing CI Source/u);
  assert.throws(() => resolveCandidateSource({ TSUMUCODE_CI_SOURCE_REQUIRED: '0' }, fallback), /Invalid CI Source mode/u);
  assert.equal(resolveCandidateSource({ CI: 'true', GITHUB_SHA: 'formal-source' }, fallback), 'formal-source');
  assert.throws(() => resolveCandidateSource({ CI: 'true' }, fallback), /Missing CI Source/u);
  assert.throws(() => resolveCandidateSource({ CI: '1', GITHUB_SHA: 'source-a', TSUMUCODE_CI_SOURCE_SHA: 'source-b' }, fallback), /Conflicting CI Source/u);
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'candidate-source-'));
  const environment = { PATH: '/usr/bin:/bin', HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const git = (...args) => execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env: environment, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Synthetic');
  git('config', 'user.email', 'unit@example.invalid');
  mkdirSync(path.join(root, 'content/course'), { recursive: true });
  mkdirSync(path.join(root, 'content/learning-paths'));
  writeFileSync(path.join(root, 'content/course/lesson.yaml'), 'value: original\n');
  writeFileSync(path.join(root, 'content/learning-paths/path.yaml'), 'id: synthetic\n');
  writeFileSync(path.join(root, '.gitignore'), 'content/course/ignored.yaml\n');
  git('add', '.');
  git('commit', '-qm', 'synthetic');
  const source = git('rev-parse', 'HEAD');
  return { root, source, git, environment };
}

for (const mutation of ['unchanged', 'wrong-source', 'bytes', 'same-size-bytes', 'missing', 'hidden-index', 'skip-worktree', 'ignored', 'untracked', 'mode', 'symlink', 'new-course', 'nested-empty', 'learning-empty']) {
  test(`candidate source ${mutation}`, async () => {
    const { root, source, git, environment } = fixture();
    const content = path.join(root, 'content/course/lesson.yaml');
    try {
      if (mutation === 'bytes' || mutation === 'hidden-index' || mutation === 'skip-worktree') {
        if (mutation === 'hidden-index') git('update-index', '--assume-unchanged', 'content/course/lesson.yaml');
        if (mutation === 'skip-worktree') git('update-index', '--skip-worktree', 'content/course/lesson.yaml');
        writeFileSync(content, 'value: changed\n');
      }
      if (mutation === 'ignored') writeFileSync(path.join(root, 'content/course/ignored.yaml'), 'extra\n');
      if (mutation === 'same-size-bytes') writeFileSync(content, 'value: modified\n');
      if (mutation === 'missing') rmSync(content);
      if (mutation === 'untracked') writeFileSync(path.join(root, 'content/course/extra.yaml'), 'extra\n');
      if (mutation === 'mode') chmodSync(content, 0o755);
      if (mutation === 'symlink') { rmSync(content); symlinkSync('other.yaml', content); }
      if (mutation === 'new-course') mkdirSync(path.join(root, 'content/new-course'));
      if (mutation === 'nested-empty') mkdirSync(path.join(root, 'content/course/unused'));
      // The byte comparison does not assert that the compiler accepts this directory;
      // learningPaths.test.ts independently requires the real compiler to reject it.
      if (mutation === 'learning-empty') mkdirSync(path.join(root, 'content/learning-paths/unused'));
      const result = () => assertCandidateContentSource(root, mutation === 'wrong-source' ? '0'.repeat(40) : source, environment);
      if (mutation === 'unchanged' || mutation === 'nested-empty' || mutation === 'learning-empty') await assert.doesNotReject(result);
      else {
        const expected = {
          'wrong-source': /Candidate source differs/u,
          bytes: /Candidate content bytes differs?/u,
          'same-size-bytes': /Candidate content bytes differs?/u,
          missing: /Candidate content missing/u,
          'hidden-index': /Candidate content bytes differs?/u,
          'skip-worktree': /Candidate content bytes differs?/u,
          ignored: /Unexpected candidate content/u,
          untracked: /Unexpected candidate content/u,
          mode: /Candidate content mode differs/u,
          symlink: /Unsafe candidate content/u,
          'new-course': /Unexpected candidate course/u,
        };
        await assert.rejects(result, expected[mutation]);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
