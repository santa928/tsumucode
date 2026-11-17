import { z } from 'zod';
import { fetchLineageJobHistory } from './lineageJobHistoryTransport';

const Id = z.string().regex(/^[1-9]\d{0,15}$/u).refine((value) => Number.isSafeInteger(Number(value)));
const Expected = z.object({
  runId: Id,
  source: z.string().regex(/^[a-f0-9]{40}$/u),
  attempt: z.number().int().min(1).max(25),
  observationJobId: Id,
}).strict();
const Job = z.object({
  id: z.number().int().positive().refine(Number.isSafeInteger),
  run_id: z.number().int().positive().refine(Number.isSafeInteger),
  run_attempt: z.number().int().positive().refine(Number.isSafeInteger),
  head_sha: z.string().regex(/^[a-f0-9]{40}$/u),
  name: z.string().min(1).max(500),
  status: z.string().max(50),
  conclusion: z.string().max(50).nullable(),
});
const Page = z.object({ total_count: z.number().int().min(1).max(1000), jobs: z.array(Job).max(1000) });

/**
 * Corroborates a completed job row only; expected identity and history remain caller claims
 * unless obtained from the trusted GitHub control plane. A Jobs API row cannot authenticate
 * direct-needs edges or any job output bytes. This never authorizes signing or deployment.
 */
export function corroborateObservationJobHistory(expectedInput: unknown, historyInput: unknown) {
  const expected = Expected.parse(expectedInput);
  const history = z.array(Page).min(1).max(25).parse(historyInput);
  if (history.length !== expected.attempt) throw Error('Incomplete observation history');
  const seen = new Set<number>();
  for (const [index, document] of history.entries()) {
    if (document.total_count !== document.jobs.length) throw Error('Incomplete observation page');
    if (seen.size + document.jobs.length > 1000) throw Error('Observation history exceeds limit');
    for (const job of document.jobs) {
      if (seen.has(job.id) || String(job.run_id) !== expected.runId ||
          job.run_attempt !== index + 1 || job.head_sha !== expected.source)
        throw Error('Observation history identity differs');
      seen.add(job.id);
    }
  }
  const matching = history[expected.attempt - 1]!.jobs.filter((job) => job.name === 'parent_observation');
  if (matching.length !== 1) throw Error('Observation job missing or ambiguous');
  const job = matching[0]!;
  if (String(job.id) !== expected.observationJobId || job.status !== 'completed' || job.conclusion !== 'success')
    throw Error('Observation job identity or result differs');
  return Object.freeze({
    jobRowMatchesClaims: true as const,
    historySourceAuthenticated: false as const,
    authorizationGranted: false as const,
    directNeedsAuthenticated: false as const,
    outputBytesAuthenticated: false as const,
  });
}

/** Uses bounded transport; no caller may interpret this result as release authorization. */
export async function inspectObservationJobHistory(expectedInput: unknown, readToken: string) {
  const expected = Expected.parse(expectedInput);
  const history = await fetchLineageJobHistory({
    runId: expected.runId,
    source: expected.source,
    currentAttempt: expected.attempt,
    status: 'in_progress',
  }, readToken);
  return corroborateObservationJobHistory(expected, history);
}
