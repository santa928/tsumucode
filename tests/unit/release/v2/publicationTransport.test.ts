// @vitest-environment node
import { afterEach, it as test, expect } from 'vitest';
import assert from 'node:assert/strict';
import { publicationTransport } from '../../../../scripts/release/v2/publicationService';
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
test('uses the fixed GitHub endpoint and keeps synthetic auth off public files', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return calls.length === 1 ? new Response('{"id":1}', { status: 200 }) : new Response('abc');
  };
  const io = publicationTransport({ GITHUB_TOKEN: 'synthetic-test-credential' });
  assert.deepEqual(await io.api('/repos/owner/site/git/tags'), { status: 200, body: { id: 1 } });
  const first = calls[0]!;
  assert.ok(first.init);
  assert.equal(first.url, 'https://api.github.com/repos/owner/site/git/tags');
  assert.equal(first.init.redirect, 'error');
  assert.equal(
    new Headers(first.init.headers).get('Authorization'),
    'Bearer synthetic-test-credential',
  );
  assert.ok(first.init.signal instanceof AbortSignal);
  assert.deepEqual(
    await io.publicFile('https://owner.github.io/site/index.html', 3),
    new TextEncoder().encode('abc'),
  );
  const second = calls[1]!;
  assert.ok(second.init);
  assert.equal(new Headers(second.init.headers).has('Authorization'), false);
  assert.equal(second.init.redirect, 'error');
});
test('rejects unsupported API destinations before any request', async () => {
  globalThis.fetch = async () => {
    throw Error('unexpected request');
  };
  await assert.rejects(
    publicationTransport({}).api('https://evil.invalid/repos/o/r/'),
    /Unsupported/,
  );
});
test('caps API response bytes and cancels oversized streams', async () => {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(JSON.stringify({ padding: 'a'.repeat(1048576) })));
          timer = setTimeout(() => {
            c.close();
          }, 20);
        },
        cancel() {
          clearTimeout(timer);
          cancelled = true;
        },
      }),
    );
  await assert.rejects(
    publicationTransport({}).api('/repos/owner/site/git/tags'),
    /size|large|limit/i,
  );
  assert.equal(cancelled, true);
});
test('rejects truncated public data rather than returning incomplete bytes', async () => {
  globalThis.fetch = async () => new Response('ab');
  await assert.rejects(
    publicationTransport({}).publicFile('https://owner.github.io/site/a', 3),
    /size|truncat/i,
  );
});
test('cancels oversized public data', async () => {
  let cancelled = false;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(4));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  await assert.rejects(
    publicationTransport({}).publicFile('https://owner.github.io/site/a', 3),
    /size/,
  );
  assert.equal(cancelled, true);
});
test('does not fetch for invalid expected byte counts', async () => {
  globalThis.fetch = async () => {
    throw Error('unexpected request');
  };
  for (const count of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])
    await assert.rejects(
      publicationTransport({}).publicFile('https://owner.github.io/site/a', count),
      /size|byte|invalid/i,
    );
});
test('propagates HTTP and JSON failures without success', async () => {
  globalThis.fetch = async () => new Response('no', { status: 404 });
  await assert.rejects(
    publicationTransport({}).publicFile('https://owner.github.io/site/a', 2),
    /failed/,
  );
  globalThis.fetch = async () => new Response('<html>');
  await assert.rejects(publicationTransport({}).api('/repos/owner/site/git/tags'));
});

test('the unprivileged service cannot issue API writes even when given a write-shaped argument', async () => {
  let method: string | undefined;
  globalThis.fetch = async (_input, init) => {
    method = init?.method;
    return new Response('{}');
  };
  const io = publicationTransport({});
  await Reflect.apply(io.api, io, [
    '/repos/owner/site/git/tags',
    { method: 'POST', body: { tag: 'forbidden' } },
  ]);
  expect(method).toBe('GET');
});
test('the Source service exposes planning only, not a privileged record writer', async () => {
  const service = await import('../../../../scripts/release/v2/publicationService');
  expect('recordCurrentDeployment' in service).toBe(false);
});
