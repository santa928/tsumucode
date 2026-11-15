import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
import { URL } from 'node:url';
import {
  binding,
  admit,
  validContext,
  verifyIdentity,
  readBounded,
  MAX_RESPONSE,
} from './guard.mjs';
const context = {
  event: 'workflow_dispatch',
  ref: 'refs/heads/main',
  repo: 'santa928/tsumucode',
  actor: 'santa928',
  workflowSha: 'a'.repeat(40),
  runSha: 'a'.repeat(40),
  candidateSha: 'b'.repeat(40),
  runId: '123',
  attempt: '2',
};
const success = (c) =>
  Object.fromEntries(
    ['pre', 'observation', 'post'].map((name) => [
      name,
      { result: 'success', binding: binding(c) },
    ]),
  );
const response = (x) => ({
  ok: true,
  body: (async function* () {
    yield Buffer.from(x);
  })(),
});
function fake(c, mutate = () => {}) {
  const calls = [];
  const objects = [
    {
      number: 356,
      state: 'open',
      draft: true,
      head: {
        repo: { full_name: c.repo },
        ref: 'codex/issue143-hosted-draft',
        sha: c.candidateSha,
      },
      base: { repo: { full_name: c.repo }, ref: 'main', sha: c.workflowSha },
    },
    { ref: 'refs/heads/main', object: { sha: c.workflowSha } },
    [
      {
        id: 7699435659,
        sha: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
        ref: 'main',
        environment: 'github-pages',
      },
    ],
    [
      {
        state: 'success',
        environment_url: 'https://santa928.github.io/tsumucode/',
        log_url: 'https://github.com/santa928/tsumucode/actions/runs/42929117936/job/1',
      },
    ],
  ];
  mutate(objects);
  const request = async (url, opts) => {
    calls.push({ url, opts });
    if (calls.length <= 4) return response(JSON.stringify(objects[calls.length - 1]));
    return response('synthetic data');
  };
  return { request, calls };
}

test('requires trusted main dispatch, reviewed full candidate, run and attempt', () => {
  assert.equal(validContext(context), true);
  for (const bad of [
    { event: 'pull_request' },
    { ref: 'refs/heads/other' },
    { repo: 'attacker/repo' },
    { actor: 'other' },
    { workflowSha: 'b'.repeat(40) },
    { candidateSha: '123' },
    { runId: '1\nBAD' },
    { attempt: '0' },
  ])
    assert.equal(validContext({ ...context, ...bad }), false);
});

test('admission rejects failures, missing or previous attempts, changed candidate, base and source, and stale final check', () => {
  const jobs = success(context);
  assert.equal(admit(context, jobs, true), true);
  assert.equal(admit(context, jobs, false), false);
  for (const [name, patch] of [
    ['pre', { result: 'failure' }],
    ['observation', { result: 'cancelled' }],
    ['post', { result: 'skipped' }],
    ['pre', { binding: { ...binding(context), attempt: '1' } }],
    ['observation', { binding: { ...binding(context), head: 'f'.repeat(40) } }],
    ['post', { binding: { ...binding(context), base: 'f'.repeat(40) } }],
    ['pre', { binding: { ...binding(context), source: 'f'.repeat(40) } }],
    ['post', { binding: undefined }],
    ['post', { binding: { ...binding(context), unexpected: 'PRIVATE_MARKER' } }],
  ])
    assert.equal(admit(context, { ...jobs, [name]: { ...jobs[name], ...patch } }, true), false);
});

test('synthetic HTTP failure sends token to fixed API only and never Pages', async () => {
  const f = fake(context);
  const ok = await verifyIdentity({ context, token: 'PRIVATE_MARKER', request: f.request });
  // Synthetic Pages bytes intentionally do not match the fixed published hashes.
  assert.equal(ok, false);
  assert.equal(f.calls.length, 5);
  for (const x of f.calls.slice(0, 4)) {
    assert.equal(x.opts.headers.authorization, 'Bearer PRIVATE_MARKER');
    assert.equal(x.opts.redirect, 'error');
    assert.equal(x.url.startsWith('https://api.github.com/repos/santa928/tsumucode/'), true);
  }
  assert.equal(f.calls[4].opts.headers, undefined);
  assert.equal(f.calls[4].opts.redirect, 'error');
});

test('rejects stale head, changed main and non-Draft before reaching deployment', async () => {
  for (const mutate of [
    (x) => {
      x[0].head.sha = 'f'.repeat(40);
    },
    (x) => {
      x[1].object.sha = 'f'.repeat(40);
    },
    (x) => {
      x[0].draft = false;
    },
  ]) {
    const f = fake(context, mutate);
    assert.equal(await verifyIdentity({ context, token: 'x', request: f.request }), false);
    assert.ok(f.calls.length <= 2);
  }
});

test('rejects missing token, oversized response, redirects/errors and invalid JSON without revealing response content', async () => {
  assert.equal(
    await verifyIdentity({
      context,
      token: '',
      request: async () => {
        throw Error('PRIVATE_MARKER');
      },
    }),
    false,
  );
  assert.equal(
    await verifyIdentity({
      context,
      token: 'x',
      request: async () => ({
        ok: true,
        body: (async function* () {
          yield Buffer.alloc(MAX_RESPONSE + 1);
        })(),
      }),
    }),
    false,
  );
  assert.equal(
    await verifyIdentity({
      context,
      token: 'x',
      request: async () => {
        throw Error('PRIVATE_MARKER');
      },
    }),
    false,
  );
  assert.equal(
    await verifyIdentity({ context, token: 'x', request: async () => response('PRIVATE_MARKER') }),
    false,
  );
});

test('full successful identity path validates all endpoints and sends token only to the four allowlisted GitHub API URLs', async () => {
  // Substitute only fixed expected digests in an isolated module copy: no network or real token.
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update('synthetic data').digest('hex');
  let text = await readFile(new URL('./guard.mjs', import.meta.url), 'utf8');
  for (const original of [
    '916497abcb399f2624553292e8ac4d1be2a546452d5a144f190dba5f64ae4e18',
    'cda11e589e968948b8e94a0265eaed7a048f28ffb140467648084ed240a48491',
    '380b46f8bffe0aeebeb19394f0ef2b5c1c23e86004d6965241ed2f6157295698',
  ]) {
    assert.equal(text.includes(original), true);
    text = text.replace(original, hash);
  }
  const testOnly = await import(
    'data:text/javascript;base64,' + Buffer.from(text).toString('base64')
  );
  const f = fake(context);
  assert.equal(
    await testOnly.verifyIdentity({ context, token: 'PRIVATE_MARKER', request: f.request }),
    true,
  );
  assert.equal(f.calls.length, 7);
  const paths = [
    '/pulls/356',
    '/git/ref/heads/main',
    '/deployments?environment=github-pages&per_page=1',
    '/deployments/7699435659/statuses',
  ];
  f.calls.slice(0, 4).forEach((x, i) => {
    assert.equal(x.url, 'https://api.github.com/repos/santa928/tsumucode' + paths[i]);
    assert.equal(x.opts.headers.authorization, 'Bearer PRIVATE_MARKER');
    assert.equal(x.opts.redirect, 'error');
  });
  for (const x of f.calls.slice(4)) {
    assert.equal(x.url.startsWith('https://santa928.github.io/tsumucode/'), true);
    assert.equal(x.opts.headers, undefined);
    assert.equal(x.opts.redirect, 'error');
  }
});

test('accepts a valid JSON response exactly at the byte bound and rejects one byte over before further requests', async () => {
  const pr = JSON.stringify({
    number: 356,
    state: 'open',
    draft: true,
    head: {
      repo: { full_name: context.repo },
      ref: 'codex/issue143-hosted-draft',
      sha: context.candidateSha,
    },
    base: { repo: { full_name: context.repo }, ref: 'main', sha: context.workflowSha },
  });
  for (const extra of [0, 1]) {
    const payload = ' '.repeat(MAX_RESPONSE - Buffer.byteLength(pr) + extra) + pr;
    let count = 0;
    const request = async () => {
      count++;
      if (count === 1) return response(payload);
      if (count === 2)
        return response(
          JSON.stringify({ ref: 'refs/heads/main', object: { sha: context.workflowSha } }),
        );
      throw Error('PRIVATE_MARKER');
    };
    assert.equal(await verifyIdentity({ context, token: 'x', request }), false);
    assert.equal(count, extra === 0 ? 3 : 1);
  }
});

test('hard deadline rejects a non-cooperative request and handles late rejection', async () => {
  let rejectRequest, signal;
  const request = (_url, options) => {
    signal = options.signal;
    return new Promise((_, reject) => {
      rejectRequest = reject;
    });
  };
  const start = Date.now();
  await assert.rejects(
    readBounded(request, 'https://example.invalid/', {}, 10),
    (error) => error.message === 'deadline',
  );
  assert.ok(Date.now() - start < 1000);
  assert.equal(signal.aborted, true);
  rejectRequest(Error('PRIVATE_MARKER'));
  await new Promise((resolve) => setTimeout(resolve, 10));
});

test('hard deadline rejects a non-cooperative body and does not wait for cancel or leak a late rejection', async () => {
  let rejectRead,
    cancelCount = 0,
    signal;
  const body = {
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise((_, reject) => {
            rejectRead = reject;
          }),
        return: () => {
          cancelCount++;
          return new Promise(() => {});
        },
      };
    },
  };
  const request = async (_url, options) => {
    signal = options.signal;
    return { ok: true, body };
  };
  const start = Date.now();
  await assert.rejects(
    readBounded(request, 'https://example.invalid/', {}, 10),
    (error) => error.message === 'deadline',
  );
  assert.ok(Date.now() - start < 1000);
  assert.equal(signal.aborted, true);
  assert.ok(cancelCount >= 1);
  rejectRead(Error('PRIVATE_MARKER'));
  await new Promise((resolve) => setTimeout(resolve, 10));
});

test('a response arriving after timeout is canceled without reading its body', async () => {
  let resolveRequest,
    reads = 0,
    closes = 0;
  const request = () =>
    new Promise((resolve) => {
      resolveRequest = resolve;
    });
  await assert.rejects(
    readBounded(request, 'https://example.invalid/', {}, 10),
    (error) => error.message === 'deadline',
  );
  resolveRequest({
    ok: true,
    body: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            reads++;
            return Promise.resolve({ done: true });
          },
          return() {
            closes++;
            return Promise.reject(Error('PRIVATE_MARKER'));
          },
        };
      },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(reads, 0);
  assert.ok(closes >= 1);
});

test('rejects an infinite stream of empty chunks without stalling', async () => {
  const body = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({ done: false, value: Buffer.alloc(0) }),
        return: async () => ({ done: true }),
      };
    },
  };
  await assert.rejects(
    readBounded(async () => ({ ok: true, body }), 'https://example.invalid/', {}, 10),
  );
});

test('monotonic deadline bounds a stream of immediately fulfilled nonempty chunks', async () => {
  const body = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({ done: false, value: Buffer.from('x') }),
        return: async () => ({ done: true }),
      };
    },
  };
  const start = Date.now();
  await assert.rejects(
    readBounded(async () => ({ ok: true, body }), 'https://example.invalid/', {}, 10),
  );
  assert.ok(Date.now() - start < 1000);
});

test('rejects a final iterator completion that returns after the monotonic deadline', async () => {
  const body = {
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          const end = performance.now() + 40;
          while (performance.now() < end) {
            /* Intentional bounded synchronous delay. */
          }
          return Promise.resolve({ done: true });
        },
        return: async () => ({ done: true }),
      };
    },
  };
  await assert.rejects(
    readBounded(async () => ({ ok: true, body }), 'https://example.invalid/', {}, 10),
  );
});
