import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const workflow = await readFile(
  new URL('../../.github/workflows/issue143-pr-contract.yml', import.meta.url),
  'utf8',
);
const testFiles = [
  'scripts/issue143-trusted/guard.node-test.mjs',
  'scripts/issue143-trusted/identity-cli.node-test.mjs',
  'scripts/issue143-trusted/workflow-wiring.node-test.mjs',
  'scripts/issue143-trusted/pr-contract.node-test.mjs',
  'scripts/issue143-trusted/scratch-preflight.node-test.mjs',
];
const testCommand = 'exec node --test ' + testFiles.join(' ');

function valid(source) {
  return (
    testFiles.every((file) => file.endsWith('.node-test.mjs')) &&
    /^ {2}pull_request:\s*$/mu.test(source) &&
    !/pull_request_target|workflow_dispatch|github\.token|secrets\./u.test(source) &&
    /^permissions: \{\}\s*$/mu.test(source) &&
    /^ {4}permissions: \{\}\s*$/mu.test(source) &&
    source.includes("github.event.pull_request.head.repo.full_name == 'santa928/tsumucode'") &&
    source.includes(
      "github.event.pull_request.head.ref == 'codex/issue143-trusted-contract-check'",
    ) &&
    source.includes('2a0dfa3a196cca736c6c7b6129e0cacb1d263d20') &&
    source.includes(
      'node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5',
    ) &&
    source.includes('GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0') &&
    source.includes(
      'credential.helper= -c core.hooksPath=/dev/null -c http.followRedirects=false',
    ) &&
    source.includes('--network none --read-only --user 1000:1000') &&
    source.includes('--cap-drop ALL --security-opt no-new-privileges:true') &&
    source.includes('dst=/repo,readonly') &&
    !/docker\.sock|--privileged|--network host/u.test(source) &&
    source.includes('sha256sum --check') &&
    source.includes('--tmpfs /mock-tmp:rw,exec,nosuid,nodev,size=8m,uid=1000,gid=1000') &&
    source.includes('--env TMPDIR=/mock-tmp') &&
    source.includes('node scripts/issue143-trusted/scratch-preflight.mjs && ' + testCommand)
  );
}

test('PR-only synthetic workflow retains fixed identity and sandbox boundaries', () => {
  assert.equal(valid(workflow), true);
});

test('rejects omission of every required synthetic suite', () => {
  for (const file of testFiles) {
    assert.equal(valid(workflow.replace(testCommand, testCommand.replace(' ' + file, ''))), false);
  }
});

test('all explicit Node suites use the Node-only filename convention', () => {
  assert.equal(testFiles.length, 5);
  for (const file of testFiles) assert.match(file, /\.node-test\.mjs$/u);
});

test('rejects a token, changed image, network, permissions or dispatch trigger', () => {
  for (const bad of [
    workflow.replace('permissions: {}', 'permissions: {contents: read}'),
    workflow.replace('pull_request:', 'workflow_dispatch:'),
    workflow.replace('--network none', '--network host'),
    workflow.replace('node:24.18.0-bookworm-slim', 'node:latest'),
    workflow + '\n# github.token\n',
  ]) {
    assert.equal(valid(bad), false);
  }
});
