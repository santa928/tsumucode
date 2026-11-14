// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { fetchLineageJobHistory } from '../../../../scripts/release/v2/lineageJobHistoryTransport';
const source = 'a'.repeat(40),
  expected = { runId: '101', source, currentAttempt: 2, status: 'in_progress' };
const run = {
  id: 101,
  run_attempt: 2,
  head_sha: source,
  head_branch: 'main',
  event: 'workflow_dispatch',
  workflow_id: 315500203,
  path: '.github/workflows/pages.yml',
  repository: { id: 1303564490, full_name: 'santa928/tsumucode' },
  head_repository: { id: 1303564490, full_name: 'santa928/tsumucode' },
  status: 'in_progress',
  conclusion: null,
};
const job = (id: number, attempt: number) => ({
  id,
  run_id: 101,
  run_attempt: attempt,
  head_sha: source,
  name: `job-${String(id)}`,
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-11-06T03:09:23Z',
  started_at: '2026-11-06T03:09:25Z',
  completed_at: '2026-11-06T03:13:31Z',
  steps: [],
  sensitive_extra: 'not returned',
});
function stub(change?: (url: string, index: number) => Response | undefined) {
  let count = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      count++;
      const altered = change?.(url, count);
      if (altered) return altered;
      if (!url.includes('/attempts/')) return new Response(JSON.stringify(run));
      const attempt = Number(/attempts\/(\d+)/u.exec(url)?.[1]);
      return new Response(JSON.stringify({ total_count: 1, jobs: [job(1000 + attempt, attempt)] }));
    }),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
});
it('reads every attempt and rechecks the run without returning unrelated API data', async () => {
  stub();
  const result = await fetchLineageJobHistory(expected, 'token');
  expect(result).toHaveLength(2);
  expect(result[0]!.jobs[0]).not.toHaveProperty('sensitive_extra');
  expect(fetch).toHaveBeenCalledTimes(6);
  const first = vi.mocked(fetch).mock.calls[0]!;
  expect(first[0]).toBe('https://api.github.com/repos/santa928/tsumucode/actions/runs/101');
  expect(first[1]).toMatchObject({ redirect: 'error', headers: { authorization: 'Bearer token' } });
});
it('handles a complete second page and rejects repeated or incomplete pages', async () => {
  const hundred = Array.from({ length: 100 }, (_, i) => job(i + 1, 1));
  stub((url) =>
    url.includes('/attempts/1/')
      ? new Response(
          JSON.stringify(
            url.includes('&page=1')
              ? { total_count: 101, jobs: hundred }
              : { total_count: 101, jobs: [job(101, 1)] },
          ),
        )
      : undefined,
  );
  const result = await fetchLineageJobHistory(expected, 'token');
  expect(result[0]!.jobs).toHaveLength(101);
  stub((url) =>
    url.includes('/attempts/1/')
      ? new Response(
          JSON.stringify(
            url.includes('&page=1')
              ? { total_count: 101, jobs: hundred }
              : { total_count: 101, jobs: [job(1, 1)] },
          ),
        )
      : undefined,
  );
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'Job history identity differs',
  );
  stub((url) =>
    url.includes('/attempts/1/')
      ? new Response(JSON.stringify({ total_count: 101, jobs: [] }))
      : undefined,
  );
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'Incomplete job history page',
  );
});
it('rejects wrong attempt, source, run, changed counts and run changes across the read', async () => {
  for (const patch of [{ run_id: 102 }, { run_attempt: 2 }, { head_sha: 'f'.repeat(40) }]) {
    stub((url) =>
      url.includes('/attempts/1/')
        ? new Response(JSON.stringify({ total_count: 1, jobs: [{ ...job(1, 1), ...patch }] }))
        : undefined,
    );
    await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
      'Job history identity differs',
    );
  }
  const hundred = Array.from({ length: 100 }, (_, i) => job(i + 1, 1));
  stub((url) =>
    url.includes('/attempts/1/')
      ? new Response(
          JSON.stringify(
            url.includes('&page=1')
              ? { total_count: 101, jobs: hundred }
              : { total_count: 102, jobs: [job(101, 1)] },
          ),
        )
      : undefined,
  );
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow('Job count changed');
  stub((_url, index) =>
    index === 6 ? new Response(JSON.stringify({ ...run, run_attempt: 3 })) : undefined,
  );
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'History run identity differs',
  );
});
it('rejects unavailable, oversized, malformed and missing job pages and invalid token', async () => {
  stub(() => new Response('', { status: 403 }));
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'Job history unavailable',
  );
  stub(() => new Response('x'.repeat(1024 * 1024 + 1)));
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'Job history exceeds limit',
  );
  stub(() => new Response('{'));
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow();
  stub((url) =>
    url.includes('/attempts/1/')
      ? new Response(JSON.stringify({ total_count: 1, jobs: [] }))
      : undefined,
  );
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow();
  await expect(fetchLineageJobHistory(expected, 'bad\ntoken')).rejects.toThrow(
    'Missing history read token',
  );
});

it('does not expose upstream stream or invalid JSON text in errors', async () => {
  const secret = 'not-for-output';
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(Error(secret));
            },
          }),
        ),
    ),
  );
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'Job history unavailable',
  );
  stub(() => new Response('{' + secret));
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'Invalid job history JSON',
  );
});

it('rejects same-count row substitution or changed steps between sweeps', async () => {
  for (const changed of [
    { ...job(1099, 1) },
    {
      ...job(1001, 1),
      steps: [
        {
          name: 'Changed',
          number: 1,
          status: 'completed',
          conclusion: 'success',
          started_at: '2026-11-06T03:09:25Z',
          completed_at: '2026-11-06T03:09:26Z',
        },
      ],
    },
  ]) {
    stub((url, index) =>
      url.includes('/attempts/1/') && index === 4
        ? new Response(JSON.stringify({ total_count: 1, jobs: [changed] }))
        : undefined,
    );
    await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
      'Job history changed during read',
    );
  }
});
it('cancels response body on non-success status', async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 403 })),
  );
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'Job history unavailable',
  );
  expect(cancel).toHaveBeenCalledOnce();
});

it('allows 25 attempts of one page while staying inside the shared API budget', async () => {
  let count = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      count++;
      if (!url.includes('/attempts/'))
        return new Response(JSON.stringify({ ...run, run_attempt: 25 }));
      const attempt = Number(/attempts\/(\d+)/u.exec(url)?.[1]);
      return new Response(JSON.stringify({ total_count: 1, jobs: [job(1000 + attempt, attempt)] }));
    }),
  );
  const result = await fetchLineageJobHistory({ ...expected, currentAttempt: 25 }, 'token');
  expect(result).toHaveLength(25);
  expect(count).toBe(52);
});
it('rejects more than 1000 jobs in one sweep even across attempts', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (!url.includes('/attempts/')) return new Response(JSON.stringify(run));
      const attempt = Number(/attempts\/(\d+)/u.exec(url)?.[1]);
      const page = Number(/[&]page=(\d+)/u.exec(url)?.[1]);
      if (attempt === 2)
        return new Response(JSON.stringify({ total_count: 1, jobs: [job(2001, 2)] }));
      return new Response(
        JSON.stringify({
          total_count: 1000,
          jobs: Array.from({ length: 100 }, (_, i) => job((page - 1) * 100 + i + 1, 1)),
        }),
      );
    }),
  );
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'Job history total jobs exceeded',
  );
});
it('stops before exceeding 60 total API calls even if sizes and job count fit', async () => {
  let count = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      count++;
      if (!url.includes('/attempts/'))
        return new Response(JSON.stringify({ ...run, run_attempt: 25 }));
      const attempt = Number(/attempts\/(\d+)/u.exec(url)?.[1]),
        page = Number(/[&]page=(\d+)/u.exec(url)?.[1]);
      const total = attempt <= 5 ? 101 : 1;
      const length = total === 101 && page === 1 ? 100 : 1;
      const jobs = Array.from({ length }, (_, i) =>
        job(attempt * 10000 + (page - 1) * 100 + i + 1, attempt),
      );
      return new Response(JSON.stringify({ total_count: total, jobs }));
    }),
  );
  await expect(
    fetchLineageJobHistory({ ...expected, currentAttempt: 25 }, 'token'),
  ).rejects.toThrow('Job history API call limit exceeded');
  expect(count).toBe(60);
});
it('rejects when the overall monotonic deadline has elapsed', async () => {
  let clock = 0;
  const timer = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  try {
    stub((_url, index) => {
      if (index === 3) clock = 120_000;
      return undefined;
    });
    await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
      'Job history deadline exceeded',
    );
  } finally {
    timer.mockRestore();
  }
});

it('does not hang if a non-success body cancel never settles', async () => {
  const cancel = vi.fn(() => new Promise<void>(() => undefined));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 403 })),
  );
  await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
    'Job history unavailable',
  );
  expect(cancel).toHaveBeenCalledOnce();
});
it('stops waiting on a fetch that ignores an aborted request signal', async () => {
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockImplementation((ms) =>
      ms === 10_000 ? AbortSignal.abort() : new AbortController().signal,
    );
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    await expect(fetchLineageJobHistory(expected, 'token')).rejects.toThrow(
      'Job history unavailable',
    );
  } finally {
    timeout.mockRestore();
  }
});

it('accepts exactly 16 MiB cumulative response bytes and rejects one byte more', async () => {
  const limit = 16 * 1024 * 1024,
    runText = JSON.stringify({ ...run, run_attempt: 9 });
  const half = (limit - 2 * Buffer.byteLength(runText)) / 2;
  const each = Math.floor(half / 9),
    extra = half - each * 9;
  const pages = Array.from({ length: 9 }, (_, i) => {
    const base = { total_count: 1, jobs: [job(1001 + i, i + 1)], padding: '' };
    const target = each + (i < extra ? 1 : 0),
      overhead = Buffer.byteLength(JSON.stringify(base));
    return JSON.stringify({ ...base, padding: 'x'.repeat(target - overhead) });
  });
  expect(pages.every((page) => Buffer.byteLength(page) <= 1024 * 1024)).toBe(true);
  expect(
    2 * Buffer.byteLength(runText) +
      2 * pages.reduce((sum, page) => sum + Buffer.byteLength(page), 0),
  ).toBe(limit);
  const install = (over: boolean) => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls++;
        if (!url.includes('/attempts/'))
          return new Response(runText + (over && calls === 20 ? ' ' : ''));
        const attempt = Number(/attempts\/(\d+)/u.exec(url)?.[1]);
        return new Response(pages[attempt - 1]);
      }),
    );
  };
  install(false);
  await expect(
    fetchLineageJobHistory({ ...expected, currentAttempt: 9 }, 'token'),
  ).resolves.toHaveLength(9);
  install(true);
  await expect(fetchLineageJobHistory({ ...expected, currentAttempt: 9 }, 'token')).rejects.toThrow(
    'Job history exceeds limit',
  );
});
it('stops on overall deadline when body read and subsequent cancel never settle', async () => {
  const deadline = new AbortController(),
    request = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockImplementation((ms) => (ms === 120_000 ? deadline.signal : request.signal));
  let signalRead: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    signalRead = resolve;
  });
  const reader = {
    read: vi.fn(() => {
      signalRead();
      return new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined);
    }),
    cancel: vi.fn(() => new Promise<void>(() => undefined)),
    releaseLock: vi.fn(),
  };
  const response = { ok: true, body: { getReader: () => reader } } as unknown as Response;
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );
    const pending = fetchLineageJobHistory(expected, 'token');
    await started;
    deadline.abort();
    await expect(pending).rejects.toThrow('Job history deadline exceeded');
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  } finally {
    timeout.mockRestore();
  }
});
