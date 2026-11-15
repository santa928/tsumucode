import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod, mkdir, stat, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';

const workflow = await readFile(
  new URL('../../.github/workflows/issue143-trusted-dispatch.yml', import.meta.url),
  'utf8',
);
const job = (name) =>
  workflow.match(
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z_]+:\\n|(?![\\s\\S]))`, 'mu'),
  )?.[1] ?? '';
const obs = job('observation');
const checkout = obs
  .match(
    /^ {6}- name: Fetch reviewed public Source without credentials\n {8}shell: bash\n {8}run: \|\n([\s\S]*?)(?=^ {6}- name:)/mu,
  )?.[1]
  .replace(/^ {10}/gmu, '');
const quote = (x) => "'" + x.replaceAll("'", "'\\''") + "'";

// Isolated test only: PATH contains no real git or env.  The mock env accepts
// exactly the expected -i arguments and execs the mock git by absolute path.
async function makeMocks(d, { mismatch = false } = {}) {
  const git = join(d, 'git'),
    env = join(d, 'env'),
    mkdirPath = join(d, 'mkdir');
  const gitScript = `#!/bin/sh\n[ "$0" = ${quote(git)} ] || exit 44\nif [ -n "\${GITHUB_TOKEN:-}\${GH_TOKEN:-}\${IDENTITY_TOKEN:-}\${ACTIONS_RUNTIME_TOKEN:-}\${GIT_ASKPASS:-}\${PRIVATE_MARKER:-}" ]; then exit 41; fi\nif [ "$GIT_CONFIG_NOSYSTEM" != 1 ] || [ "$GIT_CONFIG_GLOBAL" != /dev/null ] || [ "$GIT_TERMINAL_PROMPT" != 0 ]; then exit 42; fi\ncase "$*" in *"credential.helper="*"core.hooksPath=/dev/null"*"http.followRedirects=false"*) ;; *) exit 43;; esac\ncase "$*" in *"rev-parse FETCH_HEAD"*) case "$*" in *"-C observation"*) printf '%s\\n' ${quote((mismatch ? 'f' : 'b').repeat(40))};; *) printf '%s\\n' ${quote('a'.repeat(40))};; esac;; *"rev-parse HEAD^{tree}"*) printf '%s\\n' fb74d1c12f1081b28dad4e45e87ecef19a67e729;; esac\nexit 0\n`;
  const envScript = `#!/bin/sh\n[ "$1" = -i ] || exit 50\n[ "$2" = ${quote('PATH=' + d)} ] || exit 51\n[ "$3" = ${quote('HOME=' + join(d, 'issue143-git-home'))} ] || exit 52\n[ "$4" = GIT_CONFIG_NOSYSTEM=1 ] || exit 53\n[ "$5" = GIT_CONFIG_GLOBAL=/dev/null ] || exit 54\n[ "$6" = GIT_TERMINAL_PROMPT=0 ] || exit 55\n[ "$7" = git ] || exit 56\nshift 7\nexec /usr/bin/env -i ${quote('PATH=' + d)} ${quote('HOME=' + join(d, 'issue143-git-home'))} GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 ${quote(git)} "$@"\n`;
  await writeFile(git, gitScript);
  await writeFile(env, envScript);
  await writeFile(mkdirPath, '#!/bin/sh\nexec /bin/mkdir "$@"\n');
  await Promise.all([chmod(git, 0o700), chmod(env, 0o700), chmod(mkdirPath, 0o700)]);
}
function fixtureEnv(d, head = 'b'.repeat(40)) {
  return {
    PATH: d,
    HOME: d,
    RUNNER_TEMP: d,
    OBSERVATION_HEAD: head,
    OBSERVATION_BASE: 'a'.repeat(40),
    GITHUB_TOKEN: 'PRIVATE_MARKER',
    GH_TOKEN: 'PRIVATE_MARKER',
    IDENTITY_TOKEN: 'PRIVATE_MARKER',
    ACTIONS_RUNTIME_TOKEN: 'PRIVATE_MARKER',
    GIT_ASKPASS: 'PRIVATE_MARKER',
    GIT_CONFIG_GLOBAL: 'PRIVATE_MARKER',
    PRIVATE_MARKER: 'PRIVATE_MARKER',
  };
}

test('dispatch workflow confines identity credential to separate trusted jobs and never renders raw input', () => {
  assert.match(workflow, /^ {2}workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^ {2}pull_request:/mu);
  assert.doesNotMatch(workflow, /inputs\.candidate_sha/u);
  assert.match(obs, /^ {4}permissions: \{\}/mu);
  assert.doesNotMatch(obs, /github\.token|IDENTITY_TOKEN|uses:/u);
  for (const name of ['identity_before', 'identity_after', 'admission']) {
    const j = job(name);
    assert.ok(j.includes('uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0'));
    assert.ok(j.includes('repository: santa928/tsumucode'));
    assert.ok(j.includes('ref: ${{ github.sha }}'));
    assert.ok(j.includes('path: trusted-main'));
    assert.ok(j.includes('persist-credentials: false'));
    assert.ok(j.includes('IDENTITY_TOKEN: ${{ github.token }}'));
    assert.ok(j.includes('TRUSTED_CHECKOUT_COMMIT: ${{ steps.trusted_checkout.outputs.commit }}'));
    assert.doesNotMatch(j, /candidate_sha|pull_request_target|artifact|actions\/cache|docker/u);
  }
  assert.match(job('identity_after'), /always\(\).*needs\.identity_before\.result == 'success'/u);
  assert.match(job('admission'), /always\(\)/u);
});

test('public checkout uses only fixed absolute mock git with scrubbed environment', async () => {
  assert.ok(checkout);
  const d = await mkdtemp(join(tmpdir(), 'issue143-git-'));
  try {
    await makeMocks(d);
    const r = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', checkout], {
      cwd: d,
      env: fixtureEnv(d),
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0);
    assert.equal((r.stdout + r.stderr).includes('PRIVATE_MARKER'), false);
    assert.equal((await stat(join(d, 'issue143-git-home'))).mode & 0o777, 0o700);
    await mkdir(join(d, 'issue143-home'), { mode: 0o700 });
    assert.equal((await stat(join(d, 'issue143-home'))).mode & 0o777, 0o700);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('unvalidated raw candidate is rejected before mock git without being printed', async () => {
  const d = await mkdtemp(join(tmpdir(), 'issue143-invalid-'));
  try {
    await makeMocks(d);
    const r = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', checkout], {
      cwd: d,
      env: fixtureEnv(d, 'PRIVATE_MARKER\nraw'),
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.notEqual(r.status, 0);
    assert.equal((r.stdout + r.stderr).includes('PRIVATE_MARKER'), false);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('identity jobs use the exact trusted checkout commit and the same fixed script', () => {
  assert.equal((workflow.match(/run: &trusted_identity \|/gu) ?? []).length, 1);
  assert.equal((workflow.match(/run: \*trusted_identity/gu) ?? []).length, 2);
  assert.match(
    workflow,
    /TRUSTED_CHECKOUT_COMMIT[^\n]+github\.sha|TRUSTED_CHECKOUT_COMMIT[^\n]+GITHUB_SHA/u,
  );
  assert.ok(workflow.includes('node trusted-main/scripts/issue143-trusted/identity-cli.mjs'));
});

test('remote candidate head changing after approval stops mock checkout', async () => {
  const d = await mkdtemp(join(tmpdir(), 'issue143-head-race-'));
  try {
    await makeMocks(d, { mismatch: true });
    const r = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', checkout], {
      cwd: d,
      env: fixtureEnv(d),
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.notEqual(r.status, 0);
    assert.equal((r.stdout + r.stderr).includes('PRIVATE_MARKER'), false);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('identity code is not started when checkout commit differs from trusted workflow SHA', async () => {
  const match = workflow.match(/^ {8}run: &trusted_identity \|\n([\s\S]*?)(?=^ {2}observation:)/mu);
  assert.ok(match);
  const run = match[1].replace(/^ {10}/gmu, '');
  const d = await mkdtemp(join(tmpdir(), 'issue143-checkout-sha-'));
  try {
    const fake = join(d, 'node');
    await writeFile(fake, '#!/bin/sh\necho synthetic-node-started\n');
    await chmod(fake, 0o700);
    for (const [actual, expectedStatus] of [
      ['b'.repeat(40), 1],
      ['a'.repeat(40), 0],
    ]) {
      const env = { PATH: d, GITHUB_SHA: 'a'.repeat(40), TRUSTED_CHECKOUT_COMMIT: actual };
      const r = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', run], {
        cwd: d,
        env,
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(r.status, expectedStatus);
      assert.equal(r.stdout.includes('synthetic-node-started'), expectedStatus === 0);
    }
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('trusted checkout requires action output, actual HEAD and a clean tree', async () => {
  const match = workflow.match(/^ {8}run: &trusted_tree \|\n([\s\S]*?)(?=^ {6}- name:)/mu);
  assert.ok(match);
  const run = match[1].replace(/^ {10}/gmu, '');
  for (const item of [
    { output: 'b', actual: 'a', dirty: '', expected: 1 },
    { output: 'a', actual: 'b', dirty: '', expected: 1 },
    { output: 'a', actual: 'a', dirty: '?? synthetic', expected: 1 },
    { output: 'a', actual: 'a', dirty: '', fail: 'head', expected: 1 },
    { output: 'a', actual: 'a', dirty: '', fail: 'status', expected: 1 },
    { output: 'a', actual: 'a', dirty: '', expected: 0 },
  ]) {
    const d = await mkdtemp(join(tmpdir(), 'issue143-main-check-'));
    try {
      const fake = join(d, 'git');
      const headCommand =
        item.fail === 'head' ? 'exit 2' : `printf '%s\\n' '${item.actual.repeat(40)}'`;
      const statusCommand = item.fail === 'status' ? 'exit 2' : `printf '%s' '${item.dirty}'`;
      const script = `#!/bin/sh\ncase "$*" in 'rev-parse --verify HEAD') ${headCommand};; 'status --porcelain --untracked-files=all') ${statusCommand};; *) exit 2;; esac\n`;
      await writeFile(fake, script);
      await chmod(fake, 0o700);
      const env = {
        PATH: d,
        GITHUB_SHA: 'a'.repeat(40),
        TRUSTED_CHECKOUT_COMMIT: item.output.repeat(40),
      };
      const r = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', run], {
        cwd: d,
        env,
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(r.status, item.expected);
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  }
});
