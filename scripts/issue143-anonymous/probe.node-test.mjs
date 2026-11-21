import test from 'node:test';
import assert from 'node:assert/strict';
import { TextEncoder } from 'node:util';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { probe } from './probe.mjs';

const deployment = [
  {
    id: 7699435659,
    sha: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
    ref: 'main',
    environment: 'github-pages',
  },
];
const status = [
  {
    state: 'success',
    environment_url: 'https://santa928.github.io/tsumucode/',
    log_url: 'https://github.com/santa928/tsumucode/actions/runs/42929117936/job/130265372396',
  },
];
test('PR workflow keeps identity and network boundaries fixed', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/issue143-anonymous-probe.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /^ {2}pull_request:\s*$/mu);
  assert.match(workflow, /^permissions: \{\}\s*$/mu);
  assert.match(workflow, /^ {4}permissions: \{\}\s*$/mu);
  assert.doesNotMatch(
    workflow,
    /pull_request_target|workflow_dispatch|github\.token|secrets\.|docker\.sock/u,
  );
  assert.ok(workflow.includes('codex/issue143-anonymous-deployment-probe'));
  assert.ok(workflow.includes('2a0dfa3a196cca736c6c7b6129e0cacb1d263d20'));
  assert.ok(
    workflow.includes('GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0'),
  );
  assert.equal((workflow.match(/--network none/gu) ?? []).length, 1);
  assert.equal((workflow.match(/--network bridge/gu) ?? []).length, 1);
  assert.ok(workflow.includes('node --test scripts/issue143-anonymous/probe.node-test.mjs'));
  assert.ok(workflow.includes('node scripts/issue143-anonymous/probe.mjs'));
  assert.ok(
    workflow.indexOf('node --test scripts/issue143-anonymous/probe.node-test.mjs') <
      workflow.indexOf('node scripts/issue143-anonymous/probe.mjs'),
  );
});
function response(value, http = 200, rate = '12') {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  return {
    status: http,
    headers: { get: () => rate },
    body: {
      async *[Symbol.asyncIterator]() {
        yield bytes;
      },
    },
  };
}
async function exercise(responses) {
  const calls = [],
    lines = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const result = await probe(request, (line) => lines.push(line));
  return { result, calls, lines };
}
test('valid deployment and status use fixed GET URLs without a credential', async () => {
  const r = await exercise([response(deployment), response(status)]);
  assert.equal(r.result, true);
  assert.equal(r.calls.length, 2);
  assert.deepEqual(r.lines, [
    'deployment http=200 rate=positive fixed=match',
    'status http=200 rate=positive fixed=match',
  ]);
  for (const call of r.calls) {
    assert.equal(call.options.redirect, 'error');
    assert.deepEqual(Object.keys(call.options.headers).sort(), ['Accept', 'User-Agent']);
    assert.match(call.url, /^https:\/\/api\.github\.com\/repos\/santa928\/tsumucode\/deployments/u);
  }
});
test('403 and 429 stop after one request and retain the finite rate category', async () => {
  for (const code of [403, 429]) {
    const r = await exercise([response('SECRET-MARKER', code, '0')]);
    assert.equal(r.result, false);
    assert.equal(r.calls.length, 1);
    assert.deepEqual(r.lines, [`deployment http=${code} rate=zero fixed=not-checked`]);
  }
});
test('mismatch, empty data, bad JSON and oversized data fail without content leakage', async () => {
  for (const value of [
    [{ ...deployment[0], ref: 'other' }],
    [],
    'SECRET-MARKER',
    'x'.repeat(1024 * 1024 + 1),
  ]) {
    const r = await exercise([response(value)]);
    assert.equal(r.result, false);
    assert.equal(r.calls.length, 1);
    assert.equal(r.lines.join('').includes('SECRET-MARKER'), false);
    assert.match(r.lines[0], /^deployment http=200 rate=positive fixed=(?:mismatch|invalid)$/u);
  }
});
test('network failure and status mismatch fail closed', async () => {
  const badNetwork = await exercise([Error('SECRET-MARKER')]);
  assert.deepEqual(badNetwork.lines, [
    'deployment http=unavailable rate=unknown fixed=not-checked',
  ]);
  const badStatus = await exercise([
    response(deployment),
    response([{ ...status[0], state: 'failure' }]),
  ]);
  assert.equal(badStatus.result, false);
  assert.equal(badStatus.calls.length, 2);
  assert.equal(badStatus.lines[1], 'status http=200 rate=positive fixed=mismatch');
});

test('status rejects a different job and any extra log URL suffix', async () => {
  for (const log_url of [
    'https://github.com/santa928/tsumucode/actions/runs/42929117936/job/130265372397',
    status[0].log_url + '/extra',
  ]) {
    const r = await exercise([response(deployment), response([{ ...status[0], log_url }])]);
    assert.equal(r.result, false);
    assert.equal(r.lines[1], 'status http=200 rate=positive fixed=mismatch');
  }
});

test('invalid UTF-8 is rejected without echoing the body', async () => {
  const r = await exercise([
    {
      status: 200,
      headers: { get: () => '1' },
      body: {
        async *[Symbol.asyncIterator]() {
          yield Uint8Array.of(0xff);
        },
      },
    },
  ]);
  assert.equal(r.result, false);
  assert.deepEqual(r.lines, ['deployment http=200 rate=positive fixed=invalid']);
});

test('non-cooperative request reaches a bounded deadline and is aborted', async () => {
  const lines = [];
  let signal;
  const result = await probe(
    (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
    (line) => lines.push(line),
    5,
  );
  assert.equal(result, false);
  assert.equal(signal.aborted, true);
  assert.deepEqual(lines, ['deployment http=unavailable rate=unknown fixed=not-checked']);
});

test('an infinite stream of empty chunks is bounded without storing chunks', async () => {
  const lines = [];
  const result = await probe(
    async () => ({
      status: 200,
      headers: { get: () => '1' },
      body: {
        async *[Symbol.asyncIterator]() {
          while (true) yield new Uint8Array();
        },
      },
    }),
    (line) => lines.push(line),
    5,
  );
  assert.equal(result, false);
  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /^deployment http=(?:200|unavailable) rate=(?:positive|unknown) fixed=(?:invalid|not-checked)$/u,
  );
});
