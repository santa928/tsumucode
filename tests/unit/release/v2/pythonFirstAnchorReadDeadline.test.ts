// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { verifyPythonFirstAnchor } from '../../../../scripts/release/v2/pythonFirstAnchorVerifier';

const roots: string[] = [];
const root = () => {
  const value = mkdtempSync(path.join(os.tmpdir(), 'anchor-deadline-'));
  roots.push(value);
  mkdirSync(path.join(value, 'docs/quality'), { recursive: true });
  writeFileSync(
    path.join(value, 'docs/quality/movement-eb2-v2.json'),
    readFileSync('docs/quality/movement-eb2-v2.json'),
  );
  return value;
};
const boundedResult = async (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error ? error.message : 'non-error'),
    ),
    new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve('blocked');
      }, 300);
    }),
  ]);
const signal = () => {
  const controller = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  return controller;
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const item of roots.splice(0)) rmSync(item, { recursive: true, force: true });
});

it('rejects when fetch ignores the request abort', async () => {
  const controller = signal();
  let started!: () => void;
  const called = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.stubGlobal('fetch', () => {
    started();
    return new Promise<Response>(() => {});
  });
  const pending = verifyPythonFirstAnchor(root());
  await called;
  controller.abort();
  expect(await boundedResult(pending)).toBe('Public anchor observation timed out');
});

it('does not start fetch when the request signal is already aborted', async () => {
  const controller = signal();
  controller.abort();
  let requests = 0;
  vi.stubGlobal('fetch', () => {
    requests++;
    return Promise.resolve(new Response('{}'));
  });
  expect(await boundedResult(verifyPythonFirstAnchor(root()))).toBe(
    'Public anchor observation timed out',
  );
  expect(requests).toBe(0);
});

it('cancels a late successful response after fetch timeout', async () => {
  const controller = signal();
  let start!: () => void, resolveFetch!: (response: Response) => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const cancel = vi.fn();
  vi.stubGlobal('fetch', () => {
    start();
    return new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
  });
  const pending = verifyPythonFirstAnchor(root());
  await started;
  controller.abort();
  expect(await boundedResult(pending)).toBe('Public anchor observation timed out');
  resolveFetch(new Response(new ReadableStream({ cancel })));
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  expect(cancel).toHaveBeenCalledOnce();
});

it('cancels a non-2xx response body before returning a fixed error', async () => {
  const cancel = vi.fn();
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response(new ReadableStream({ cancel }), { status: 403 })),
  );
  await expect(verifyPythonFirstAnchor(root())).rejects.toThrow(
    'Public anchor observation unavailable',
  );
  expect(cancel).toHaveBeenCalledOnce();
});

it('rejects when body read ignores the request abort', async () => {
  const controller = signal();
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          pull() {
            started();
            return new Promise<void>(() => {});
          },
        }),
      ),
    ),
  );
  const pending = verifyPythonFirstAnchor(root());
  await reading;
  controller.abort();
  expect(await boundedResult(pending)).toBe('Public anchor observation timed out');
});

it('cancels and releases a pending reader and observes its late rejection', async () => {
  const controller = signal();
  let started!: () => void, rejectRead!: (error: Error) => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const cancel = vi.fn(() => Promise.resolve()),
    releaseLock = vi.fn();
  vi.stubGlobal('fetch', () =>
    Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () => {
            started();
            return new Promise<never>((_resolve, reject) => {
              rejectRead = reject;
            });
          },
          cancel,
          releaseLock,
        }),
      },
    }),
  );
  const pending = verifyPythonFirstAnchor(root());
  await reading;
  controller.abort();
  expect(await boundedResult(pending)).toBe('Public anchor observation timed out');
  expect(cancel).toHaveBeenCalledOnce();
  expect(releaseLock).toHaveBeenCalledOnce();
  rejectRead(new Error('synthetic-secret-late-read'));
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
});

it('cancels and unlocks an actual pending ReadableStream on timeout', async () => {
  const deadline = signal();
  let start!: () => void;
  const reading = new Promise<void>((resolve) => {
    start = resolve;
  });
  const onCancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        start();
      },
      cancel: onCancel,
    },
    { highWaterMark: 0 },
  );
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, body: stream }));
  const pending = verifyPythonFirstAnchor(root());
  await reading;
  expect(stream.locked).toBe(true);
  deadline.abort();
  expect(await boundedResult(pending)).toBe('Public anchor observation timed out');
  expect(onCancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
});

it('rejects when a fulfilled read and the abort occur synchronously together', async () => {
  const controller = signal();
  const ref = JSON.stringify({
    ref: 'refs/tags/tsumucode-app-42929117936-7699435659',
    object: { type: 'tag', sha: 'fa87f692442cb3876b07ef33e583e29b438dae31' },
  });
  let reads = 0,
    requests = 0;
  vi.stubGlobal('fetch', () => {
    requests++;
    return Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () => {
            if (++reads === 1)
              return Promise.resolve({ done: false, value: new TextEncoder().encode(ref) });
            controller.abort();
            return Promise.resolve({ done: true });
          },
          cancel: () => Promise.resolve(),
          releaseLock: () => {},
        }),
      },
    });
  });
  expect(await boundedResult(verifyPythonFirstAnchor(root()))).toBe(
    'Public anchor observation timed out',
  );
  expect(requests).toBe(1);
});

it('rejects oversize input even when stream cancellation never settles', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024 + 1));
          },
          cancel() {
            return new Promise<void>(() => {});
          },
        }),
      ),
    ),
  );
  expect(await boundedResult(verifyPythonFirstAnchor(root()))).toBe(
    'Public anchor response exceeds limit',
  );
});

it('rejects a chunked overflow and safely observes a later cancellation rejection', async () => {
  let rejectCancel!: (error: Error) => void;
  const cancel = new Promise<void>((_resolve, reject) => {
    rejectCancel = reject;
  });
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024));
            controller.enqueue(Uint8Array.of(0));
          },
          cancel() {
            return cancel;
          },
        }),
      ),
    ),
  );
  expect(await boundedResult(verifyPythonFirstAnchor(root()))).toBe(
    'Public anchor response exceeds limit',
  );
  rejectCancel(new Error('synthetic-secret-cancel'));
  await new Promise<void>((resolve) => setImmediate(resolve));
});

it('accepts an exactly one MiB ref response and still rejects the next failed request', async () => {
  const ref = JSON.stringify({
    ref: 'refs/tags/tsumucode-app-42929117936-7699435659',
    object: { type: 'tag', sha: 'fa87f692442cb3876b07ef33e583e29b438dae31' },
  });
  const exact = ref + ' '.repeat(1024 * 1024 - Buffer.byteLength(ref));
  let count = 0;
  vi.stubGlobal('fetch', () =>
    Promise.resolve(++count === 1 ? new Response(exact) : new Response(null, { status: 403 })),
  );
  await expect(verifyPythonFirstAnchor(root())).rejects.toThrow(
    'Public anchor observation unavailable',
  );
  expect(count).toBe(2);
});

it('handles thousands of empty and single-byte chunks without weakening the byte limit', async () => {
  const ref = JSON.stringify({
    ref: 'refs/tags/tsumucode-app-42929117936-7699435659',
    object: { type: 'tag', sha: 'fa87f692442cb3876b07ef33e583e29b438dae31' },
  });
  let request = 0,
    chunk = 0;
  vi.stubGlobal('fetch', () => {
    if (++request > 1) return Promise.resolve(new Response(null, { status: 403 }));
    return Promise.resolve(
      new Response(
        new ReadableStream({
          pull(controller) {
            chunk++;
            if (chunk === 1) controller.enqueue(new TextEncoder().encode(ref));
            else if (chunk <= 20481) controller.enqueue(new Uint8Array(0));
            else if (chunk <= 53249) controller.enqueue(Uint8Array.of(32));
            else controller.close();
          },
        }),
      ),
    );
  });
  await expect(verifyPythonFirstAnchor(root())).rejects.toThrow(
    'Public anchor observation unavailable',
  );
  expect(request).toBe(2);
  expect(chunk).toBeGreaterThan(53000);
});

it('rejects abort after thousands of empty chunks', async () => {
  const deadline = signal();
  let chunks = 0,
    requests = 0;
  vi.stubGlobal('fetch', () => {
    requests++;
    return Promise.resolve(
      new Response(
        new ReadableStream({
          pull(controller) {
            if (++chunks === 4096) deadline.abort();
            controller.enqueue(new Uint8Array(0));
          },
        }),
      ),
    );
  });
  expect(await boundedResult(verifyPythonFirstAnchor(root()))).toBe(
    'Public anchor observation timed out',
  );
  expect(chunks).toBeGreaterThanOrEqual(4096);
  expect(requests).toBe(1);
});

it('rejects missing body, invalid UTF-8 and invalid JSON', async () => {
  for (const response of [
    new Response(null),
    new Response(Uint8Array.of(0xff)),
    new Response('{broken'),
  ]) {
    vi.stubGlobal('fetch', () => Promise.resolve(response));
    await expect(verifyPythonFirstAnchor(root())).rejects.toBeInstanceOf(Error);
  }
});

it('does not expose fetch or malformed JSON values in errors', async () => {
  const secret = 'synthetic-secret-never-output';
  for (const makeResponse of [
    () => Promise.reject(new Error(secret)),
    () => Promise.resolve(new Response('{"secret":"' + secret)),
  ]) {
    vi.stubGlobal('fetch', makeResponse);
    await expect(verifyPythonFirstAnchor(root())).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error.message === 'Public anchor observation failed' &&
        !String(error.stack).includes(secret),
    );
  }
});
