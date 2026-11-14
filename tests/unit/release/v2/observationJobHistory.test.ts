import { describe, expect, it, vi } from 'vitest';
import { corroborateObservationJobHistory, inspectObservationJobHistory } from '../../../../scripts/release/v2/observationJobHistory';
import { fetchLineageJobHistory } from '../../../../scripts/release/v2/lineageJobHistoryTransport';
vi.mock('../../../../scripts/release/v2/lineageJobHistoryTransport', () => ({ fetchLineageJobHistory: vi.fn() }));
const source = 'a'.repeat(40);
const expected = { runId: '101', source, attempt: 2, observationJobId: '202' };
const job = (id: number, attempt: number, patch: Record<string, unknown> = {}) => ({
  id, run_id: 101, run_attempt: attempt, head_sha: source,
  name: 'parent_observation', status: 'completed', conclusion: 'success', ...patch,
});
const valid = () => [
  { total_count: 1, jobs: [job(201, 1)] },
  { total_count: 1, jobs: [job(202, 2)] },
];
describe('observation history corroboration only', () => {
  it('matches one completed row and denies all authorization claims', () => {
    expect(corroborateObservationJobHistory(expected, valid())).toEqual({
      jobRowMatchesClaims: true, historySourceAuthenticated: false, authorizationGranted: false,
      directNeedsAuthenticated: false, outputBytesAuthenticated: false,
    });
  });
  it('rejects incomplete attempt or page and duplicated IDs', () => {
    expect(() => corroborateObservationJobHistory(expected, valid().slice(0, 1))).toThrow();
    const incomplete = valid(); incomplete[1]!.total_count = 2;
    expect(() => corroborateObservationJobHistory(expected, incomplete)).toThrow();
    const duplicate = valid(); duplicate[1]!.jobs[0]!.id = 201;
    expect(() => corroborateObservationJobHistory(expected, duplicate)).toThrow();
  });
  it('preserves the transport total-job limit across attempts', () => {
    const prior = Array.from({ length: 1000 }, (_, index) => job(index + 1000, 1, { name: 'other' }));
    expect(() => corroborateObservationJobHistory(expected, [
      { total_count: 1000, jobs: prior }, { total_count: 1, jobs: [job(202, 2)] },
    ])).toThrow('exceeds limit');
  });
  it('rejects a previous-attempt ID, wrong source, wrong run, or prior attempt in current page', () => {
    expect(() => corroborateObservationJobHistory({ ...expected, observationJobId: '201' }, valid())).toThrow();
    for (const patch of [{ head_sha: 'b'.repeat(40) }, { run_id: 102 }, { run_attempt: 1 }]) {
      const history = valid(); history[1]!.jobs[0] = job(202, 2, patch);
      expect(() => corroborateObservationJobHistory(expected, history)).toThrow();
    }
  });
  it('rejects failed, skipped, missing conclusion, in-progress, wrong ID, and duplicate name with another ID', () => {
    for (const patch of [{ conclusion: 'failure' }, { conclusion: 'skipped' },
      { conclusion: undefined }, { status: 'in_progress', conclusion: null }, { id: 203 },
      { name: 'wrong_observation' }]) {
      const history = valid(); history[1]!.jobs[0] = job(202, 2, patch);
      expect(() => corroborateObservationJobHistory(expected, history)).toThrow();
    }
    const ambiguous = valid(); ambiguous[1]!.jobs.push(job(203, 2)); ambiguous[1]!.total_count = 2;
    expect(() => corroborateObservationJobHistory(expected, ambiguous)).toThrow();
  });
  it('rejects bad expected identity or unsafe numeric job IDs', () => {
    expect(() => corroborateObservationJobHistory({ ...expected, runId: '090' }, valid())).toThrow();
    expect(() => corroborateObservationJobHistory({ ...expected, observationJobId: '9007199254740992' }, valid())).toThrow();
    const invalid = valid(); invalid[1]!.jobs[0]!.id = Number.MAX_SAFE_INTEGER + 1;
    expect(() => corroborateObservationJobHistory(expected, invalid)).toThrow();
  });
  it('passes exact context to bounded transport and never upgrades its output', async () => {
    vi.mocked(fetchLineageJobHistory).mockResolvedValueOnce(valid() as never);
    const result = await inspectObservationJobHistory(expected, 'mock-token');
    expect(fetchLineageJobHistory).toHaveBeenCalledWith(
      { runId: '101', source, currentAttempt: 2, status: 'in_progress' }, 'mock-token',
    );
    expect(result.authorizationGranted).toBe(false);
    expect(result.outputBytesAuthenticated).toBe(false);
    expect(result.directNeedsAuthenticated).toBe(false);
  });
  it('fails closed if bounded transport times out or rejects incomplete pages', async () => {
    vi.mocked(fetchLineageJobHistory).mockRejectedValueOnce(Error('Job history deadline exceeded'));
    await expect(inspectObservationJobHistory(expected, 'mock-token')).rejects.toThrow('deadline');
    vi.mocked(fetchLineageJobHistory).mockRejectedValueOnce(Error('Incomplete job history page'));
    await expect(inspectObservationJobHistory(expected, 'mock-token')).rejects.toThrow('Incomplete');
  });
});
