import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.resolve('scripts/ci/bind-pr-checkout.sh');
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pr-bind-fixture-'));
  const env = { PATH: '/usr/bin:/bin', HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const git = (...args) => execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Synthetic'); git('config', 'user.email', 'unit@example.invalid');
  git('remote', 'add', 'origin', 'https://github.com/santa928/tsumucode');
  writeFileSync(path.join(root, 'base'), 'old\n'); git('add', '.'); git('commit', '-qm', 'old');
  const old = git('rev-parse', 'HEAD');
  writeFileSync(path.join(root, 'base'), 'new\n'); git('commit', '-qam', 'base');
  const base = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/main', base);
  git('checkout', '-qb', 'feature'); writeFileSync(path.join(root, 'feature'), 'change\n'); git('add', '.'); git('commit', '-qm', 'head');
  const head = git('rev-parse', 'HEAD');
  git('checkout', '-q', 'main'); git('merge', '--no-ff', '-qm', 'merge', head);
  const merge = git('rev-parse', 'HEAD');
  const output = path.join(root, 'output');
  return { root, git, base, old, head, merge, output, env: { ...env, GITHUB_REPOSITORY: 'santa928/tsumucode', PR_BASE_REPO: 'santa928/tsumucode', PR_HEAD_REPO: 'santa928/tsumucode', PR_BASE_REF: 'main', PR_EVENT_BASE_SHA: old, PR_HEAD_SHA: head, PR_MERGE_SHA: merge, GITHUB_OUTPUT: output } };
}
function run(f, change = {}) { return spawnSync('/bin/sh', [script], { cwd: f.root, env: { ...f.env, ...change }, encoding: 'utf8' }); }

test('checkout main ref can bind a valid merge even if event base is older', () => {
  const f = fixture();
  try {
    const r = run(f);
    assert.equal(r.status, 0);
    assert.match(readFileSync(f.output, 'utf8'), new RegExp(`^checked_base_sha=${f.base}$`, 'mu'));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('matching event and checkout base also succeeds, including a fork head', () => {
  const f = fixture();
  try { assert.equal(run(f, { PR_EVENT_BASE_SHA: f.base, PR_HEAD_REPO: 'other/fork' }).status, 0); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a stacked PR binds its named base branch from the same checkout', () => {
  const f = fixture();
  try {
    f.git('update-ref', 'refs/remotes/origin/review/stack', f.base);
    assert.equal(run(f, { PR_BASE_REF: 'review/stack' }).status, 0);
    assert.match(readFileSync(f.output, 'utf8'), new RegExp(`^checked_base_sha=${f.base}$`, 'mu'));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

for (const mutation of ['wrong-repo', 'wrong-origin', 'wrong-branch', 'other-branch', 'unsafe-branch', 'option-branch', 'previous-branch', 'bad-sha', 'divergent-event-base', 'wrong-merge', 'wrong-head', 'advanced-main', 'missing-ref', 'head-does-not-include-base', 'tree-differs', 'three-parents']) {
  test(`rejects ${mutation}`, () => {
    const f = fixture();
    try {
      let change = {};
      if (mutation === 'wrong-repo') change.PR_BASE_REPO = 'other/repo';
      if (mutation === 'wrong-origin') f.git('remote', 'set-url', 'origin', 'https://github.com/other/repo');
      if (mutation === 'wrong-branch') change.PR_BASE_REF = 'other';
      if (mutation === 'other-branch') { f.git('update-ref', 'refs/remotes/origin/review/old', f.old); change.PR_BASE_REF = 'review/old'; }
      if (mutation === 'unsafe-branch') change.PR_BASE_REF = '../main';
      if (mutation === 'option-branch') change.PR_BASE_REF = '--help';
      if (mutation === 'previous-branch') change.PR_BASE_REF = '@{-1}';
      if (mutation === 'bad-sha') change.PR_EVENT_BASE_SHA = 'not-a-sha';
      if (mutation === 'divergent-event-base') change.PR_EVENT_BASE_SHA = f.head;
      if (mutation === 'wrong-merge') change.PR_MERGE_SHA = f.old;
      if (mutation === 'wrong-head') change.PR_HEAD_SHA = f.base;
      if (mutation === 'advanced-main') f.git('update-ref', 'refs/remotes/origin/main', f.head);
      if (mutation === 'missing-ref') f.git('update-ref', '-d', 'refs/remotes/origin/main');
      if (mutation === 'head-does-not-include-base') {
        const branch = f.git('commit-tree', f.git('rev-parse', `${f.head}^{tree}`), '-p', f.old, '-m', 'unrelated-head');
        const merge = f.git('commit-tree', f.git('rev-parse', `${branch}^{tree}`), '-p', f.base, '-p', branch, '-m', 'fake-merge');
        f.git('reset', '--hard', '-q', merge); change = { PR_HEAD_SHA: branch, PR_MERGE_SHA: merge };
      }
      if (mutation === 'tree-differs') {
        const merge = f.git('commit-tree', f.git('rev-parse', `${f.base}^{tree}`), '-p', f.base, '-p', f.head, '-m', 'fake-merge');
        f.git('reset', '--hard', '-q', merge); change.PR_MERGE_SHA = merge;
      }
      if (mutation === 'three-parents') {
        const merge = f.git('commit-tree', f.git('rev-parse', `${f.head}^{tree}`), '-p', f.base, '-p', f.head, '-p', f.old, '-m', 'fake-merge');
        f.git('reset', '--hard', '-q', merge); change.PR_MERGE_SHA = merge;
      }
      assert.notEqual(run(f, change).status, 0);
      assert.equal(existsSync(f.output), false);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}
