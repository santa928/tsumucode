// @vitest-environment node
import { describe, expect, it } from 'vitest';
const candidate = {
  schemaVersion: 1,
  repository: 'owner/site',
  runId: '101',
  buildJobId: 'build',
  buildAttempt: 1,
  artifactId: '301',
  artifactDigest: '1'.repeat(64),
  planDigest: '2'.repeat(64),
  recipe: {
    sourceCommit: '3'.repeat(40),
    sourceTree: '4'.repeat(40),
    lockDigest: '5'.repeat(64),
    workflowDigest: '6'.repeat(64),
    policyDigest: '7'.repeat(64),
    toolchain: 'fixed',
    basePath: '/site/',
  },
};
async function results() {
  const { hashValue } = await import('../../../../scripts/release/v2/identity');
  return [1, 2].map((attempt) => ({
    schemaVersion: 1,
    suite: 'unit',
    candidateDigest: hashValue(candidate),
    inputDigest: '8'.repeat(64),
    recipeDigest: hashValue(candidate.recipe),
    runId: '101',
    jobId: 'unit',
    verificationAttempt: attempt,
    status: 'passed',
    targets: ['unit/full'],
    startedAt: '2026-10-28T12:00:00Z',
    finishedAt: '2026-10-28T12:01:00Z',
    expiresAt: '2026-10-29T12:01:00Z',
    reportDigest: '9'.repeat(64),
  }));
}
describe('same-run result attempt selection', () => {
  it('retains original successful receipts and selects a newer verified same-suite attempt', async () => {
    const { selectResultAttempts } = await import('../../../../scripts/release/v2/attempts');
    expect(
      selectResultAttempts(candidate, await results()).map((row) => row.verificationAttempt),
    ).toEqual([2]);
  });
  it.each(['duplicate', 'wrong-candidate', 'wrong-run', 'too-old-build'])(
    'rejects %s without overwriting original build identity',
    async (failure) => {
      const { selectResultAttempts } = await import('../../../../scripts/release/v2/attempts');
      const rows = await results();
      if (failure === 'duplicate') rows.push(rows[0]!);
      if (failure === 'wrong-candidate') rows[0]!.candidateDigest = '0'.repeat(64);
      if (failure === 'wrong-run') rows[0]!.runId = '102';
      if (failure === 'too-old-build') rows[0]!.verificationAttempt = 0;
      expect(() => selectResultAttempts(candidate, rows)).toThrow();
    },
  );
});
