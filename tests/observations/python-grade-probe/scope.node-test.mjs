import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

test('the actual workflow scope allows probe files and rejects hidden rename and unrelated edits', () => {
  const temp = mkdtempSync(join(tmpdir(), 'probe-scope-'));
  const poisonedHome = join(temp, 'poisoned-home');
  const poisonedHooks = join(poisonedHome, 'hooks');
  const marker = join(temp, 'hook-ran');
  mkdirSync(poisonedHooks, { recursive: true });
  writeFileSync(join(poisonedHome, '.gitconfig'), `[core]\n  hooksPath = ${poisonedHooks}\n`);
  writeFileSync(join(poisonedHooks, 'pre-commit'), `#!/bin/sh\ntouch '${marker}'\n`, {
    mode: 0o755,
  });
  const shellMarker = join(temp, 'shell-ran');
  const shellStartup = join(temp, 'shell-startup');
  writeFileSync(shellStartup, `touch '${shellMarker}'\n`);
  const poisonedEnv = {
    HOME: poisonedHome,
    BASH_ENV: shellStartup,
    'BASH_FUNC_git%%': '() { :; }',
    PATH: '/usr/bin:/bin',
  };
  assert.equal(poisonedEnv.BASH_ENV, shellStartup);
  const env = {
    HOME: temp,
    XDG_CONFIG_HOME: temp,
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ATTR_NOSYSTEM: '1',
  };
  assert.equal(Object.hasOwn(env, 'BASH_FUNC_git%%'), false);
  const envCheck = spawnSync('/bin/bash', ['-c', 'test -z "${BASH_ENV+x}"'], { env });
  assert.equal(envCheck.status, 0);
  const repo = join(temp, 'probe');
  const template = join(temp, 'empty-template');
  const git = (...args) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], {
      cwd: repo,
      env,
      stdio: 'ignore',
    });
  try {
    mkdirSync(repo);
    mkdirSync(template);
    git('init', '-q', `--template=${template}`);
    git('config', 'core.hooksPath', '/dev/null');
    git('config', 'core.fsmonitor', 'false');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'user.name', 'Fixture');
    execFileSync(
      'git',
      ['-c', `core.hooksPath=${poisonedHooks}`, 'commit', '--allow-empty', '-qm', 'hook-control'],
      { cwd: repo, env, stdio: 'ignore' },
    );
    assert.equal(existsSync(marker), true);
    rmSync(marker);
    writeFileSync(join(repo, 'unrelated-original'), 'same bytes\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      env,
      encoding: 'utf8',
    }).trim();
    const workflow = readFileSync(
      fileURLToPath(
        new URL('../../../.github/workflows/python-grade-observer-probe.yml', import.meta.url),
      ),
      'utf8',
    );
    const snippet = workflow.match(
      /git -C probe diff --no-renames --name-only -z [^\n]+ \| node -e '[\s\S]*?\n\s*'/u,
    )?.[0];
    assert.ok(snippet);
    const files = [
      '.github/workflows/python-grade-observer-probe.yml',
      ...[
        'probe.spec.ts',
        'playwright.config.ts',
        'run.mjs',
        'verify.mjs',
        'verify.node-test.mjs',
        'private-log.mjs',
        'private-log.node-test.mjs',
        'private-command.mjs',
        'private-command.node-test.mjs',
        'scope.node-test.mjs',
        'diagnose.mjs',
        'diagnose.node-test.mjs',
        'probe-stage.mjs',
        'probe-stage.node-test.mjs',
        'probe-stage.d.mts',
      ].map((name) => `tests/observations/python-grade-probe/${name}`),
    ];
    for (const file of files) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      writeFileSync(join(repo, file), 'probe\n');
    }
    git('add', '.');
    git('commit', '-qm', 'probe');
    const check = () =>
      spawnSync(
        'bash',
        ['-o', 'pipefail', '-c', snippet.replace('93be9a451f7c433e0ab90bd1918c81c7f40f96c3', base)],
        { cwd: temp, env: { ...env, PROBE_HEAD: 'HEAD' }, encoding: 'utf8' },
      ).status;
    assert.equal(check(), 0);
    writeFileSync(join(repo, 'other'), 'not allowed');
    git('add', '.');
    git('commit', '-qm', 'extra');
    assert.notEqual(check(), 0);
    git('reset', '--hard', '-q', 'HEAD^');
    rmSync(join(repo, files[1]));
    git('mv', 'unrelated-original', files[1]);
    git('commit', '-qm', 'rename');
    assert.notEqual(check(), 0);
    assert.equal(existsSync(marker), false);
    assert.equal(existsSync(shellMarker), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
