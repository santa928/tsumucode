import { z } from 'zod';
const Id = z.string().regex(/^[1-9]\d{0,15}$/u);
const Expected = z
  .object({
    runId: Id,
    source: z.string().regex(/^[a-f0-9]{40}$/u),
    currentAttempt: z.number().int().min(1).max(25),
    status: z.enum(['in_progress', 'completed']),
  })
  .strict();
const Repo = z.object({ id: z.literal(1303564490), full_name: z.literal('santa928/tsumucode') });
const Run = z.object({
  id: z.number().int().positive(),
  run_attempt: z.number().int().positive(),
  head_sha: z.string(),
  head_branch: z.literal('main'),
  event: z.literal('workflow_dispatch'),
  workflow_id: z.literal(315500203),
  path: z.literal('.github/workflows/pages.yml'),
  repository: Repo,
  head_repository: Repo,
  status: z.enum(['in_progress', 'completed']),
  conclusion: z.string().nullable(),
});
const Step = z.object({
  name: z.string().min(1).max(500),
  number: z.number().int().positive(),
  status: z.string().max(50),
  conclusion: z.string().max(50).nullable(),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
});
const Job = z.object({
  id: z.number().int().positive(),
  run_id: z.number().int().positive(),
  run_attempt: z.number().int().positive(),
  head_sha: z.string(),
  name: z.string().min(1).max(500),
  status: z.string().max(50),
  conclusion: z.string().max(50).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
  steps: z.array(Step).max(200),
  check_run_url: z.string().max(2048).optional(),
});
const Page = z.object({
  total_count: z.number().int().min(1).max(1000),
  jobs: z.array(Job).max(100),
});
/**
 * Read-only transport, not authorization. Expected identity must be independently trusted;
 * the caller must authenticate protected needs, artifact origins, receipts and carry semantics.
 * Names and status are not interpreted as proof of job execution. Two sweeps detect some races,
 * but are not an atomic snapshot; callers still need a fresh fence immediately before use.
 * Both sweeps share a 60-request / 120-second / 16-MiB budget; each sweep allows 1000 jobs.
 */
export async function fetchLineageJobHistory(input: unknown, readToken: string) {
  const expected = Expected.parse(input);
  if (!readToken || readToken.length > 8192 || /[\r\n]/u.test(readToken))
    throw Error('Missing history read token');
  const base = `https://api.github.com/repos/santa928/tsumucode/actions/runs/${expected.runId}`;
  let cumulative = 0,
    calls = 0;
  const startedAt = performance.now(),
    deadline = AbortSignal.timeout(120_000);
  const assertDeadline = () => {
    if (deadline.aborted || performance.now() - startedAt >= 120_000)
      throw Error('Job history deadline exceeded');
  };
  async function read(url: string): Promise<unknown> {
    assertDeadline();
    if (calls >= 60) throw Error('Job history API call limit exceeded');
    calls++;
    const signal = AbortSignal.any([AbortSignal.timeout(10000), deadline]);
    const bounded = <T>(promise: Promise<T>): Promise<T> =>
      new Promise((resolve, reject) => {
        const aborted = () => {
          signal.removeEventListener('abort', aborted);
          reject(Error('Request timed out'));
        };
        if (signal.aborted) {
          aborted();
          void promise.catch(() => undefined);
          return;
        }
        signal.addEventListener('abort', aborted, { once: true });
        promise.then(
          (value) => {
            signal.removeEventListener('abort', aborted);
            resolve(value);
          },
          () => {
            signal.removeEventListener('abort', aborted);
            reject(Error('Request failed'));
          },
        );
      });
    let response: Response;
    try {
      response = await bounded(
        fetch(url, {
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${readToken}`,
            'x-github-api-version': '2022-11-28',
          },
          redirect: 'error',
          signal,
        }),
      );
    } catch {
      assertDeadline();
      throw Error('Job history unavailable');
    }
    if (!response.ok) {
      if (response.body) void response.body.cancel().catch(() => undefined);
      throw Error('Job history unavailable');
    }
    if (!response.body) throw Error('Job history unavailable');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0,
      oversized = false;
    try {
      for (;;) {
        assertDeadline();
        const part = await bounded(reader.read());
        if (part.done) break;
        size += part.value.byteLength;
        cumulative += part.value.byteLength;
        if (size > 1024 * 1024 || cumulative > 16 * 1024 * 1024) {
          oversized = true;
          throw Error('Job history exceeds limit');
        }
        chunks.push(part.value);
      }
    } catch {
      void reader.cancel().catch(() => undefined);
      if (oversized) throw Error('Job history exceeds limit');
      assertDeadline();
      throw Error('Job history unavailable');
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* A pending read is being cancelled. */
      }
    }
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      ) as unknown;
    } catch {
      throw Error('Invalid job history JSON');
    }
  }
  function checkRun(value: unknown) {
    const run = Run.parse(value);
    if (
      String(run.id) !== expected.runId ||
      run.run_attempt !== expected.currentAttempt ||
      run.head_sha !== expected.source ||
      run.status !== expected.status ||
      (run.status === 'in_progress' && run.conclusion !== null) ||
      (run.status === 'completed' && !run.conclusion)
    )
      throw Error('History run identity differs');
    return JSON.stringify(run);
  }
  const before = checkRun(await read(base));
  async function sweep() {
    const documents: { total_count: number; jobs: z.infer<typeof Job>[] }[] = [],
      seen = new Set<number>();
    for (let attempt = 1; attempt <= expected.currentAttempt; attempt++) {
      let total: number | undefined;
      const jobs: z.infer<typeof Job>[] = [];
      for (let page = 1; page <= 10; page++) {
        const result = Page.parse(
          await read(`${base}/attempts/${String(attempt)}/jobs?per_page=100&page=${String(page)}`),
        );
        if (total !== undefined && result.total_count !== total) throw Error('Job count changed');
        total = result.total_count;
        if (seen.size + result.jobs.length > 1000) throw Error('Job history total jobs exceeded');
        for (const job of result.jobs) {
          if (
            seen.has(job.id) ||
            String(job.run_id) !== expected.runId ||
            job.run_attempt !== attempt ||
            job.head_sha !== expected.source
          )
            throw Error('Job history identity differs');
          seen.add(job.id);
          jobs.push(job);
        }
        if (jobs.length === total) break;
        if (result.jobs.length !== 100 || jobs.length > total)
          throw Error('Incomplete job history page');
      }
      if (total === undefined || jobs.length !== total) throw Error('Incomplete job history');
      documents.push({ total_count: total, jobs });
    }
    return documents;
  }
  const first = await sweep(),
    second = await sweep();
  if (JSON.stringify(first) !== JSON.stringify(second))
    throw Error('Job history changed during read');
  if (checkRun(await read(base)) !== before) throw Error('History run changed during read');
  assertDeadline();
  return second;
}
