/** Synthetic fetch/streams only: no network, token or production authorization. */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout, setImmediate } from 'node:timers';
import {
  inspectPredeployArtifactMetadata,
  inspectSameRunArtifactMetadata,
} from './lineageArtifactMetadata.ts';

const { AbortController, AbortSignal, ReadableStream, Response } = globalThis;

const input = {
  runId: '123',
  source: 'a'.repeat(40),
  attempt: '2',
  candidateId: '11',
  metadataId: '12',
  qualificationId: '13',
  reportId: '14',
};
const originalFetch = globalThis.fetch;
const priorFetch = async () => {
  throw Error('Unexpected network access');
};
globalThis.fetch = priorFetch;
after(() => {
  globalThis.fetch = originalFetch;
});

test('unexpected fetch is rejected by the synthetic harness', async () => {
  await assert.rejects(globalThis.fetch('https://synthetic.invalid'), /Unexpected network access/);
});
const priorTimeout = AbortSignal.timeout;
const unreachable = () => new Promise(() => {});
const limit = (promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(Error('probe timed out')), 150)),
  ]);

async function scenario(fn, fetch, timeout = 20) {
  const controller = new AbortController();
  globalThis.fetch = fetch;
  AbortSignal.timeout = () => controller.signal;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    await fn();
  } finally {
    clearTimeout(timer);
    globalThis.fetch = priorFetch;
    AbortSignal.timeout = priorTimeout;
  }
}

test('oversized body rejects even if cancel never settles', async () => {
  let canceled = 0;
  await scenario(
    async () => {
      await assert.rejects(
        limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
        /Artifact metadata too large/,
      );
      assert.equal(canceled, 1);
    },
    async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: false, value: new Uint8Array(65537) }),
          cancel: () => {
            canceled++;
            return unreachable();
          },
          releaseLock() {},
        }),
      },
    }),
  );
});

test('stalled body aborts at the existing request signal', async () => {
  let canceled = 0;
  await scenario(
    async () => {
      await assert.rejects(
        limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
        /Artifact metadata timed out/,
      );
      assert.equal(canceled, 1);
    },
    async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: unreachable,
          cancel: () => {
            canceled++;
            return unreachable();
          },
          releaseLock() {},
        }),
      },
    }),
  );
});

test('stalled fetch aborts at the existing request signal', async () => {
  await scenario(async () => {
    await assert.rejects(
      limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
      /Artifact metadata timed out/,
    );
  }, unreachable);
});

test('valid predeploy metadata retains its exact three artifacts', async () => {
  let count = 0;
  await scenario(
    async () => {
      const { reportId, ...predeploy } = input;
      void reportId;
      const out = await inspectPredeployArtifactMetadata(predeploy, 'synthetic-token');
      assert.deepEqual(
        out.map((value) => value.id),
        ['11', '12', '13'],
      );
    },
    async () => {
      const index = count++,
        kind = ['candidate', 'candidate-metadata', 'qualification'][index];
      const value = {
        id: 11 + index,
        name: `${kind}-123-2`,
        size_in_bytes: 100,
        expired: false,
        digest: `sha256:${'b'.repeat(64)}`,
        workflow_run: {
          id: 123,
          repository_id: 1303564490,
          head_repository_id: 1303564490,
          head_branch: 'main',
          head_sha: input.source,
        },
      };
      return new Response(JSON.stringify(value), { status: 200 });
    },
    100,
  );
});

test('exact size is parsed, one byte above fails the size limit', async () => {
  for (const [size, expected] of [
    [65536, /Artifact metadata invalid/],
    [65537, /Artifact metadata too large/],
  ]) {
    await scenario(
      async () => {
        await assert.rejects(
          limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
          expected,
        );
      },
      async () => new Response(' '.repeat(size), { status: 200 }),
    );
  }
});

test('network failure and malformed JSON do not expose synthetic error text', async () => {
  const marker = 'synthetic-sensitive-marker';
  for (const fetch of [
    async () => {
      throw Error(marker);
    },
    async () => new Response(marker, { status: 200 }),
  ]) {
    await scenario(async () => {
      await assert.rejects(
        limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
        (error) => {
          assert.ok(
            ['Artifact metadata unavailable', 'Artifact metadata invalid'].includes(error.message),
          );
          assert.ok(!error.message.includes(marker));
          assert.equal(error.cause, undefined);
          return true;
        },
      );
    }, fetch);
  }
});

test('late response is canceled after fetch deadline and never read', async () => {
  let resolveFetch,
    canceled = 0,
    read = 0;
  const late = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  await scenario(
    async () => {
      await assert.rejects(
        limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
        /Artifact metadata timed out/,
      );
      resolveFetch({
        ok: true,
        body: {
          cancel: () => {
            canceled++;
            return Promise.resolve();
          },
          getReader: () => {
            read++;
          },
        },
      });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(canceled, 1);
      assert.equal(read, 0);
    },
    () => late,
  );
});

test('repeated empty reads yield so the deadline can fire', async () => {
  let reads = 0,
    canceled = 0;
  await scenario(
    async () => {
      await assert.rejects(
        limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
        /Artifact metadata timed out/,
      );
      assert.ok(reads >= 256);
      assert.equal(canceled, 1);
    },
    async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            reads++;
            return { done: false, value: new Uint8Array(0) };
          },
          cancel: () => {
            canceled++;
            return Promise.resolve();
          },
          releaseLock() {},
        }),
      },
    }),
  );
});

test('duplicate artifact IDs are rejected before any fetch', async () => {
  let calls = 0;
  await scenario(
    async () => {
      await assert.rejects(
        inspectSameRunArtifactMetadata({ ...input, reportId: '11' }, 'synthetic-token'),
        /Artifact IDs collide/,
      );
      assert.equal(calls, 0);
    },
    async () => {
      calls++;
      throw Error('unexpected fetch');
    },
  );
});

test('postdeploy keeps the existing mixed-attempt metadata behavior', async () => {
  let count = 0;
  await scenario(
    async () => {
      const out = await inspectSameRunArtifactMetadata(input, 'synthetic-token');
      assert.deepEqual(
        out.map((value) => value.attempt),
        ['1', '1', '2', '2'],
      );
    },
    async () => {
      const index = count++,
        kind = ['candidate', 'candidate-metadata', 'qualification', 'public-report'][index];
      const value = {
        id: 11 + index,
        name: `${kind}-123-${index < 2 ? '1' : '2'}`,
        size_in_bytes: 100,
        expired: false,
        digest: `sha256:${'b'.repeat(64)}`,
        workflow_run: {
          id: 123,
          repository_id: 1303564490,
          head_repository_id: 1303564490,
          head_branch: 'main',
          head_sha: input.source,
        },
      };
      return new Response(JSON.stringify(value), { status: 200 });
    },
    100,
  );
});

test('non-success response and invalid UTF-8 remain rejected without body disclosure', async () => {
  for (const response of [
    new Response('synthetic-sensitive-marker', { status: 404 }),
    new Response(new Uint8Array([0xff]), { status: 200 }),
  ]) {
    await scenario(
      async () => {
        await assert.rejects(
          limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
          (error) => {
            assert.ok(
              ['Artifact metadata unavailable', 'Artifact metadata invalid'].includes(
                error.message,
              ),
            );
            assert.ok(!error.message.includes('synthetic-sensitive-marker'));
            return true;
          },
        );
      },
      async () => response,
    );
  }
});

test('cancel rejection cannot replace the bounded size failure', async () => {
  await scenario(
    async () => {
      await assert.rejects(
        limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
        (error) => {
          assert.equal(error.message, 'Artifact metadata too large');
          assert.equal(error.cause, undefined);
          return true;
        },
      );
      await new Promise((resolve) => setImmediate(resolve));
    },
    async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: false, value: new Uint8Array(65537) }),
          cancel: () => Promise.reject(Error('synthetic-sensitive-marker')),
          releaseLock() {},
        }),
      },
    }),
  );
});

test('64KiB exact valid JSON remains accepted for every artifact', async () => {
  let count = 0;
  await scenario(
    async () => {
      const out = await inspectSameRunArtifactMetadata(input, 'synthetic-token');
      assert.deepEqual(
        out.map((value) => value.id),
        ['11', '12', '13', '14'],
      );
    },
    async () => {
      const index = count++,
        kind = ['candidate', 'candidate-metadata', 'qualification', 'public-report'][index];
      const value = {
        id: 11 + index,
        name: `${kind}-123-2`,
        size_in_bytes: 100,
        expired: false,
        digest: `sha256:${'b'.repeat(64)}`,
        workflow_run: {
          id: 123,
          repository_id: 1303564490,
          head_repository_id: 1303564490,
          head_branch: 'main',
          head_sha: input.source,
        },
      };
      const json = JSON.stringify(value);
      const raw = json + ' '.repeat(65536 - Buffer.byteLength(json));
      assert.equal(Buffer.byteLength(raw), 65536);
      return new Response(raw, { status: 200 });
    },
    100,
  );
});

test('actual ReadableStream pending read is canceled and lock released after timeout', async () => {
  let canceled = 0;
  const neverCancel = unreachable();
  const body = new ReadableStream({
    cancel() {
      canceled++;
      return neverCancel;
    },
  });
  await scenario(
    async () => {
      await assert.rejects(
        limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
        /Artifact metadata timed out/,
      );
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(canceled, 1);
      assert.equal(body.locked, false);
    },
    async () => new Response(body, { status: 200 }),
  );
});

test('late rejecting read after timeout is observed, not an unhandled rejection', async () => {
  const unhandled = [],
    capture = (reason) => unhandled.push(reason);
  let rejectRead,
    canceled = 0;
  const read = new Promise((_, reject) => {
    rejectRead = reject;
  });
  process.on('unhandledRejection', capture);
  try {
    await scenario(
      async () => {
        await assert.rejects(
          limit(inspectSameRunArtifactMetadata(input, 'synthetic-token')),
          /Artifact metadata timed out/,
        );
        rejectRead(Error('synthetic-sensitive-marker'));
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(canceled, 1);
        assert.deepEqual(unhandled, []);
      },
      async () => ({
        ok: true,
        body: {
          getReader: () => ({
            read: () => read,
            cancel: () => {
              canceled++;
              return Promise.resolve();
            },
            releaseLock() {},
          }),
        },
      }),
    );
  } finally {
    process.off('unhandledRejection', capture);
  }
});

test('unknown input keys never leak their synthetic marker in an error', async () => {
  const marker = 'synthetic-sensitive-marker';
  const { reportId, ...predeploy } = input;
  void reportId;
  for (const run of [
    () => inspectSameRunArtifactMetadata({ ...input, [marker]: true }, 'synthetic-token'),
    () => inspectPredeployArtifactMetadata({ ...predeploy, [marker]: true }, 'synthetic-token'),
  ])
    await assert.rejects(run, (error) => {
      assert.equal(error.message, 'Invalid artifact metadata context');
      assert.ok(!error.message.includes(marker));
      assert.equal(error.cause, undefined);
      return true;
    });
});
