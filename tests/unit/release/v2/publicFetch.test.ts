// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchBytes } from '../../../../scripts/release/v2/captureBaseline';
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
});
async function endpoint(statuses: readonly number[]) {
  const seen: { path: string | undefined; cache: string | undefined }[] = [];
  const server = createServer((request, response) => {
    seen.push({ path: request.url, cache: request.headers['cache-control'] });
    const status = statuses[Math.min(seen.length - 1, statuses.length - 1)]!;
    response.writeHead(status, status === 302 ? { Location: '/redirected' } : {});
    response.end(status === 200 ? 'fixed-public-bytes' : 'unavailable');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Expected local HTTP address');
  return { url: `http://127.0.0.1:${String(address.port)}/asset.svg`, seen };
}
it.each([502, 503, 504])(
  'rechecks the same URL after transient HTTP%d and returns only successful bytes',
  async (status) => {
    const { url, seen } = await endpoint([status, 200]);
    expect(new TextDecoder().decode(await fetchBytes(url))).toBe('fixed-public-bytes');
    expect(seen).toEqual([
      { path: '/asset.svg', cache: 'no-cache' },
      { path: '/asset.svg', cache: 'no-cache' },
    ]);
  },
);
it('fails after at most3 attempts when public delivery remains unavailable', async () => {
  const { url, seen } = await endpoint([503]);
  await expect(fetchBytes(url)).rejects.toThrow('503');
  expect(seen).toHaveLength(3);
});
it('refuses missing content without retrying or accepting its error body', async () => {
  const { url, seen } = await endpoint([404, 200]);
  await expect(fetchBytes(url)).rejects.toThrow('404');
  expect(seen).toHaveLength(1);
});
it('does not follow a redirect into other content', async () => {
  const { url, seen } = await endpoint([302, 200]);
  await expect(fetchBytes(url)).rejects.toThrow();
  expect(seen).toHaveLength(1);
});

const MAX_BYTES = 16 * 1024 * 1024;
const TEST_URL = 'https://example.invalid/public';

it('preserves exact bytes and accepts an empty response body', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([0, 255, 128, 10])));
  fetchMock.mockResolvedValueOnce(new Response(null));
  expect(await fetchBytes(TEST_URL)).toEqual(new Uint8Array([0, 255, 128, 10]));
  expect(await fetchBytes(TEST_URL)).toEqual(new Uint8Array());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0]![1]).toMatchObject({
    redirect: 'error',
    headers: { 'Cache-Control': 'no-cache' },
  });
});

it('returns an owned copy when an incoming chunk is later mutated', async () => {
  const chunk = new Uint8Array([1, 2, 3]);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body));
  const bytes = await fetchBytes(TEST_URL);
  chunk.fill(9);
  expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  expect(body.locked).toBe(false);
});

it('preserves byte order across many small and empty chunks', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < 2048; index++) {
        controller.enqueue(new Uint8Array());
        controller.enqueue(new Uint8Array([index % 256]));
      }
      controller.close();
    },
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body));
  const bytes = await fetchBytes(TEST_URL);
  expect(bytes).toEqual(Uint8Array.from({ length: 2048 }, (_value, index) => index % 256));
  expect(body.locked).toBe(false);
});

it('accepts exactly the bound across chunks even with a falsely large Content-Length', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_BYTES - 1).fill(0xa5));
      controller.enqueue(new Uint8Array([0x5a]));
      controller.close();
    },
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(body, { headers: { 'Content-Length': String(MAX_BYTES + 1) } }),
  );
  const result = await fetchBytes(TEST_URL);
  expect(result.byteLength).toBe(MAX_BYTES);
  expect(result[0]).toBe(0xa5);
  expect(result[MAX_BYTES - 2]).toBe(0xa5);
  expect(result[MAX_BYTES - 1]).toBe(0x5a);
});

it('stops reading on actual overflow despite a falsely small Content-Length', async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        if (pulls === 1) controller.enqueue(new Uint8Array(MAX_BYTES));
        else if (pulls === 2) controller.enqueue(new Uint8Array([1]));
        else throw Error('Read continued after overflow');
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(body, { headers: { 'Content-Length': '1' } }));
  await expect(fetchBytes(TEST_URL)).rejects.toThrow('Public baseline response exceeds its limit');
  expect(pulls).toBe(2);
  expect(cancelled).toBe(true);
  expect(body.locked).toBe(false);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('preserves the overflow failure when cancellation hangs', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_BYTES + 1));
    },
    cancel() {
      return new Promise<void>(() => {});
    },
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body));
  await expect(fetchBytes(TEST_URL)).rejects.toThrow('Public baseline response exceeds its limit');
  expect(body.locked).toBe(false);
}, 1000);

it('does not replace the overflow error when cancellation rejects', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_BYTES + 1));
    },
    cancel() {
      return Promise.reject(new Error('cancel failed'));
    },
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body));
  await expect(fetchBytes(TEST_URL)).rejects.toThrow('Public baseline response exceeds its limit');
  expect(body.locked).toBe(false);
});

it('does not retry or hide an interrupted body', async () => {
  const failure = new Error('body interrupted');
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (++pulls === 1) controller.enqueue(new Uint8Array([1]));
        else controller.error(failure);
      },
    },
    { highWaterMark: 0 },
  );
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body));
  await expect(fetchBytes(TEST_URL)).rejects.toBe(failure);
  expect(body.locked).toBe(false);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('cancels a transient response before retrying and accepts only successful bytes', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  fetchMock.mockResolvedValueOnce(new Response(body, { status: 503 }));
  fetchMock.mockImplementationOnce(async () => {
    expect(cancelled).toBe(true);
    return new Response(new Uint8Array([1, 2]));
  });
  expect(await fetchBytes(TEST_URL)).toEqual(new Uint8Array([1, 2]));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(body.locked).toBe(false);
});

it('preserves cancellation failure and never retries the transient status', async () => {
  const failure = new Error('cancellation failed');
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      return Promise.reject(failure);
    },
  });
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(body, { status: 503 }));
  await expect(fetchBytes(TEST_URL)).rejects.toBe(failure);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});

it('fails on deadline for pending transient cancellation and observes late rejection', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeoutMock = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(10));
  let rejectCancellation: ((error: Error) => void) | undefined;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      return new Promise<void>((_resolve, reject) => {
        rejectCancellation = reject;
      });
    },
  });
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(body, { status: 503 }));
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    await expect(fetchBytes(TEST_URL)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(timeoutMock).toHaveBeenCalledWith(15_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(rejectCancellation).toBeDefined();
    rejectCancellation!(new Error('late cancellation failure'));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(unhandled).not.toHaveBeenCalled();
  } finally {
    process.off('unhandledRejection', unhandled);
  }
});

it.each([
  { kind: 'timeout', cancellation: 'pending' },
  { kind: 'timeout', cancellation: 'fulfilled' },
  { kind: 'non-error', cancellation: 'pending' },
  { kind: 'non-error', cancellation: 'fulfilled' },
] as const)(
  'handles $kind abort with $cancellation cancellation without retry or leaking the reason',
  async ({ kind, cancellation }) => {
    const controller = new AbortController();
    const secretMarker = 'private non-error abort reason';
    const reason =
      kind === 'timeout'
        ? new DOMException('original deadline', 'TimeoutError')
        : { marker: secretMarker };
    const timeoutMock = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        controller.abort(reason);
        return cancellation === 'pending' ? new Promise<void>(() => {}) : Promise.resolve();
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(body, { status: 503 }));
    const failure = await fetchBytes(TEST_URL).then(
      () => undefined,
      (error: unknown) => error,
    );
    if (kind === 'timeout') {
      expect(failure).toBe(reason);
      expect(failure).toMatchObject({ name: 'TimeoutError', message: 'original deadline' });
    } else {
      expect(failure).toBeInstanceOf(Error);
      const normalized = failure as Error;
      expect(normalized.message).toBe('Public baseline request aborted');
      expect(normalized.cause).toBeUndefined();
      expect(JSON.stringify({ message: normalized.message, stack: normalized.stack })).not.toContain(
        secretMarker,
      );
    }
    expect(timeoutMock).toHaveBeenCalledWith(15_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  },
);

it.each(['timeout', 'non-error'] as const)(
  'normalizes %s after the cancellation wins an already-aborted race',
  async (kind) => {
    const controller = new AbortController();
    const secretMarker = 'private race abort reason';
    const reason =
      kind === 'timeout'
        ? new DOMException('original deadline', 'TimeoutError')
        : { marker: secretMarker };
    let reasonReads = 0;
    Object.defineProperty(controller.signal, 'reason', {
      configurable: true,
      get() {
        reasonReads++;
        return reason;
      },
    });
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const cancel = vi.fn(() => {
      controller.abort(reason);
      return Promise.resolve();
    });
    const response = { ok: false, status: 503, body: { cancel } } as unknown as Response;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    const failure = await fetchBytes(TEST_URL).then(
      () => undefined,
      (error: unknown) => error,
    );
    // First read is deadline rejection; second proves the post-race branch was taken.
    expect(reasonReads).toBe(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    if (kind === 'timeout') {
      expect(failure).toBe(reason);
      expect(failure).toMatchObject({ name: 'TimeoutError', message: 'original deadline' });
    } else {
      expect(failure).toBeInstanceOf(Error);
      const normalized = failure as Error;
      expect(normalized.message).toBe('Public baseline request aborted');
      expect(normalized.cause).toBeUndefined();
      expect(JSON.stringify({ message: normalized.message, stack: normalized.stack })).not.toContain(
        secretMarker,
      );
    }
  },
);

it('does not retry when a timed-out cancellation subsequently succeeds', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(10));
  let resolveCancellation: (() => void) | undefined;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      return new Promise<void>((resolve) => {
        resolveCancellation = resolve;
      });
    },
  });
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(body, { status: 503 }));
  await expect(fetchBytes(TEST_URL)).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(resolveCancellation).toBeDefined();
  resolveCancellation!();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('keeps the next attempt independent after successful cancellation and backoff', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeoutMock = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(10));
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
  fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([7])));
  expect(await fetchBytes(TEST_URL)).toEqual(new Uint8Array([7]));
  expect(timeoutMock).toHaveBeenCalledTimes(2);
  expect(timeoutMock).toHaveBeenNthCalledWith(1, 15_000);
  expect(timeoutMock).toHaveBeenNthCalledWith(2, 15_000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('keeps the 15 second response deadline during body consumption without retry', async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const timeoutMock = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(10));
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    const signal = options?.signal as AbortSignal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener('abort', () => {
          controller.error(signal.reason);
        }, { once: true });
      },
    });
    return new Response(body);
  });
  await expect(fetchBytes(TEST_URL)).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(timeoutMock).toHaveBeenCalledWith(15_000);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('times out an uncooperative fetch and cancels a late response without retrying', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeoutMock = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(10));
  let resolveFetch: ((response: Response) => void) | undefined;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
    new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }),
  );
  await expect(fetchBytes(TEST_URL)).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(timeoutMock).toHaveBeenCalledWith(15_000);
  expect(fetchMock).toHaveBeenCalledOnce();
  const cancelled = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
  expect(resolveFetch).toBeDefined();
  resolveFetch!(new Response(body));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(cancelled).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('observes late fetch rejection after timeout without emitting unhandled rejection', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(10));
  let rejectFetch: ((reason: Error) => void) | undefined;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
    new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    }),
  );
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    await expect(fetchBytes(TEST_URL)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(rejectFetch).toBeDefined();
    rejectFetch!(new Error('late fetch failure'));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(unhandled).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    process.off('unhandledRejection', unhandled);
  }
});

it('observes a late response cleanup rejection without hiding the timeout', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(10));
  let resolveFetch: ((response: Response) => void) | undefined;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
    new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }),
  );
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    await expect(fetchBytes(TEST_URL)).rejects.toMatchObject({ name: 'TimeoutError' });
    const cancelled = vi.fn(() => Promise.reject(new Error('late cleanup failure')));
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    expect(resolveFetch).toBeDefined();
    resolveFetch!(new Response(body));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(cancelled).toHaveBeenCalledOnce();
    expect(unhandled).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    process.off('unhandledRejection', unhandled);
  }
});

it('does not wait for cancellation after an uncooperative body times out', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeoutMock = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(10));
  const cancelled = vi.fn(() => new Promise<void>(() => {}));
  const body = new ReadableStream<Uint8Array>({
    pull: () => new Promise<void>(() => {}),
    cancel: cancelled,
  });
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body));
  await expect(fetchBytes(TEST_URL)).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(timeoutMock).toHaveBeenCalledWith(15_000);
  expect(cancelled).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('observes late read/cancel rejections and releases an uncooperative reader', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(10));
  let rejectRead: ((reason: Error) => void) | undefined;
  const read = vi.fn(
    () =>
      new Promise<ReadableStreamReadResult<Uint8Array>>((_resolve, reject) => {
        rejectRead = reject;
      }),
  );
  const cancel = vi.fn(() => Promise.reject(new Error('late cancel failure')));
  const releaseLock = vi.fn();
  const response = {
    ok: true,
    body: { getReader: () => ({ read, cancel, releaseLock }) },
  } as unknown as Response;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    await expect(fetchBytes(TEST_URL)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
    expect(rejectRead).toBeDefined();
    rejectRead!(new Error('late read failure'));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(unhandled).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    process.off('unhandledRejection', unhandled);
  }
});

it('removes deadline listeners after successful fetch and body reads', async () => {
  const controller = new AbortController();
  const added = vi.spyOn(controller.signal, 'addEventListener');
  const removed = vi.spyOn(controller.signal, 'removeEventListener');
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array([1, 2])));
  expect(await fetchBytes(TEST_URL)).toEqual(new Uint8Array([1, 2]));
  expect(added.mock.calls.length).toBeGreaterThan(0);
  expect(removed.mock.calls.length).toBe(added.mock.calls.length);
});

it('does not retain or overlap deadline listeners across many small reads', async () => {
  const controller = new AbortController();
  const added = vi.spyOn(controller.signal, 'addEventListener');
  const removed = vi.spyOn(controller.signal, 'removeEventListener');
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  let index = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(stream) {
        if (index === 1024) {
          stream.close();
        } else {
          stream.enqueue(index++ % 2 === 0 ? new Uint8Array() : new Uint8Array([7]));
        }
      },
    },
    { highWaterMark: 0 },
  );
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body));
  expect(await fetchBytes(TEST_URL)).toEqual(new Uint8Array(512).fill(7));
  expect(added.mock.calls.length).toBeGreaterThan(1024);
  expect(removed.mock.calls.length).toBe(added.mock.calls.length);
  for (let i = 0; i < added.mock.calls.length; i++) {
    expect(removed.mock.calls[i]![1]).toBe(added.mock.calls[i]![1]);
    expect(added.mock.invocationCallOrder[i]).toBeLessThan(removed.mock.invocationCallOrder[i]!);
    if (i + 1 < added.mock.calls.length)
      expect(removed.mock.invocationCallOrder[i]).toBeLessThan(
        added.mock.invocationCallOrder[i + 1]!,
      );
  }
  expect(body.locked).toBe(false);
});

it('allows the real deadline timer to stop immediately fulfilled empty reads', async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  let reads = 0;
  let readsAtAbort = -1;
  const timeoutMock = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
    const signal = nativeTimeout(10);
    signal.addEventListener(
      'abort',
      () => {
        readsAtAbort = reads;
      },
      { once: true },
    );
    return signal;
  });
  const cancelled = vi.fn();
  const body = new ReadableStream<Uint8Array>(
    {
      pull(stream) {
        const until = performance.now() + 0.1;
        while (performance.now() < until) {
          // Finite synthetic work makes the deadline due before the stream ends.
        }
        if (++reads === 4096) stream.close();
        else stream.enqueue(new Uint8Array());
      },
      cancel: cancelled,
    },
    { highWaterMark: 0 },
  );
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(body));
  await expect(fetchBytes(TEST_URL)).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(timeoutMock).toHaveBeenCalledWith(15_000);
  expect(reads).toBeLessThan(4096);
  expect(readsAtAbort).toBeGreaterThan(0);
  expect(readsAtAbort % 256).toBe(0);
  expect(reads).toBe(readsAtAbort);
  expect(cancelled).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
  expect(fetchMock).toHaveBeenCalledOnce();
}, 5000);

it.each(['pending', 'rejected'] as const)(
  'preserves terminal HTTP status with %s body cancellation and does not retry',
  async (mode) => {
    const cancel = vi.fn(() =>
      mode === 'pending' ? new Promise<void>(() => {}) : Promise.reject(new Error('cancel failed')),
    );
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(body, { status: 404 }));
    await expect(fetchBytes(TEST_URL)).rejects.toThrow('Public baseline request failed: 404');
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);

it('cancels all three transient bodies and preserves the final 503 status', async () => {
  const cancels = [vi.fn(), vi.fn(), vi.fn()];
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  for (const cancel of cancels) {
    const body = new ReadableStream<Uint8Array>({ cancel });
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 503 }));
  }
  await expect(fetchBytes(TEST_URL)).rejects.toThrow('Public baseline request failed: 503');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  for (const cancel of cancels) expect(cancel).toHaveBeenCalledOnce();
});

it('rejects a fulfilled fetch that synchronously aborts and cancels its late body', async () => {
  const controller = new AbortController();
  const reason = new DOMException('deadline', 'TimeoutError');
  let reasonReads = 0;
  Object.defineProperty(controller.signal, 'reason', {
    configurable: true,
    get() {
      reasonReads++;
      return reason;
    },
  });
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const cancel = vi.fn(() => Promise.resolve());
  const response = { body: { cancel } } as unknown as Response;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    controller.abort(reason);
    return Promise.resolve(response);
  });
  await expect(fetchBytes(TEST_URL)).rejects.toBe(reason);
  await Promise.resolve();
  expect(reasonReads).toBe(2);
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each(['data', 'done'] as const)(
  'rejects a fulfilled %s read that synchronously aborts, without using the value',
  async (kind) => {
    const controller = new AbortController();
    const reason = new DOMException('deadline', 'TimeoutError');
    let reasonReads = 0;
    Object.defineProperty(controller.signal, 'reason', {
      configurable: true,
      get() {
        reasonReads++;
        return reason;
      },
    });
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const read = vi.fn(() => {
      controller.abort(reason);
      return Promise.resolve(
        kind === 'data'
          ? { done: false, value: new Uint8Array([7]) }
          : { done: true, value: undefined },
      );
    });
    const cancel = vi.fn(() => Promise.resolve());
    const releaseLock = vi.fn();
    const response = {
      ok: true,
      body: { getReader: () => ({ read, cancel, releaseLock }) },
    } as unknown as Response;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    await expect(fetchBytes(TEST_URL)).rejects.toBe(reason);
    expect(reasonReads).toBe(2);
    expect(read).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
