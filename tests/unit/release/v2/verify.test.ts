// @vitest-environment node
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { BuildIdentitySchema } from '../../../../scripts/release/v2/schema';
import { hashArtifact, hashValue } from '../../../../scripts/release/v2/identity';

const candidate = BuildIdentitySchema.parse({
  schemaVersion: 1,
  repository: 'owner/site',
  runId: '101',
  buildJobId: '201',
  buildAttempt: 1,
  artifactDigest: 'a'.repeat(64),
  artifactId: '301',
  planDigest: 'b'.repeat(64),
  recipe: {
    sourceCommit: '1'.repeat(40),
    sourceTree: '2'.repeat(40),
    lockDigest: 'c'.repeat(64),
    workflowDigest: 'd'.repeat(64),
    policyDigest: 'e'.repeat(64),
    toolchain: 'fixed-node-image',
    basePath: '/site/',
  },
});
const requirement = {
  suite: 'browser-chromium',
  producerJobId: '401',
  inputDigest: 'f'.repeat(64),
  targets: ['topic/lesson/solution', 'topic/lesson/starter'],
};
const context = {
  repository: 'owner/site',
  runId: '101',
  sourceCommit: '1'.repeat(40),
  workflowDigest: 'd'.repeat(64),
  planDigest: candidate.planDigest,
  recipeDigest: hashValue(candidate.recipe),
  eventName: 'workflow_dispatch',
  ref: 'refs/heads/main',
  attempt: 2,
  now: '2026-10-28T14:20:00Z',
};
function passed() {
  return {
    schemaVersion: 1,
    suite: 'browser-chromium',
    candidateDigest: hashValue(candidate),
    inputDigest: 'f'.repeat(64),
    recipeDigest: hashValue(candidate.recipe),
    runId: '101',
    jobId: '401',
    verificationAttempt: 2,
    status: 'passed',
    targets: ['topic/lesson/solution', 'topic/lesson/starter'],
    startedAt: '2026-10-28T14:00:00Z',
    finishedAt: '2026-10-28T14:01:00Z',
    expiresAt: '2026-10-29T14:01:00Z',
    reportDigest: createHash('sha256').update('actual test result').digest('hex'),
  };
}
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('release result verification', () => {
  it('retains build attempt1 while accepting successful verification attempt2', async () => {
    const { verifyResults } = await import('../../../../scripts/release/v2/verify');
    const result = verifyResults(candidate, [requirement], [passed()], context);
    expect(result.status).toBe('technical-passed');
    expect(result.buildAttempt).toBe(1);
    expect(result.verificationAttempts).toEqual([2]);
    expect(candidate.buildAttempt).toBe(1);
  });
  it.each(['plan', 'recipe'])(
    'rejects a self-consistent but untrusted %s replacement',
    async (field) => {
      const { verifyResults } = await import('../../../../scripts/release/v2/verify');
      const forged = structuredClone(candidate);
      if (field === 'plan') forged.planDigest = '0'.repeat(64);
      else forged.recipe.policyDigest = '0'.repeat(64);
      const result = {
        ...passed(),
        candidateDigest: hashValue(forged),
        recipeDigest: hashValue(forged.recipe),
      };
      expect(() => verifyResults(forged, [requirement], [result], context)).toThrow();
    },
  );
  it.each([
    'missing',
    'duplicate',
    'extra',
    'failed',
    'pending',
    'wrong-run',
    'wrong-recipe',
    'wrong-bytes',
    'missing-target',
    'duplicate-target',
    'expired',
    'future-attempt',
    'reversed-time',
  ])('rejects %s evidence', async (failure) => {
    const { verifyResults } = await import('../../../../scripts/release/v2/verify');
    const result = passed();
    const results: unknown[] = [result];
    switch (failure) {
      case 'missing':
        results.length = 0;
        break;
      case 'duplicate':
        results.push({ ...result });
        break;
      case 'extra':
        results.push({ ...result, suite: 'unrequested' });
        break;
      case 'failed':
        result.status = 'failed';
        break;
      case 'pending':
        result.status = 'pending';
        break;
      case 'wrong-run':
        result.runId = '999';
        break;
      case 'wrong-recipe':
        result.recipeDigest = '0'.repeat(64);
        break;
      case 'wrong-bytes':
        result.candidateDigest = '0'.repeat(64);
        break;
      case 'missing-target':
        result.targets.pop();
        break;
      case 'duplicate-target':
        result.targets.push(result.targets[0]!);
        break;
      case 'expired':
        result.expiresAt = '2026-10-28T14:10:00Z';
        break;
      case 'future-attempt':
        result.verificationAttempt = 3;
        break;
      case 'reversed-time':
        result.finishedAt = '2026-10-28T13:59:00Z';
        break;
    }
    expect(() => verifyResults(candidate, [requirement], results, context)).toThrow();
  });
  it.each([
    { ...context, eventName: 'pull_request' },
    { ...context, ref: 'refs/heads/untrusted' },
    { ...context, repository: 'other/site' },
    { ...context, sourceCommit: '3'.repeat(40) },
    { ...context, workflowDigest: '0'.repeat(64) },
  ])('rejects a candidate outside the trusted release context', async (untrusted) => {
    const { verifyResults } = await import('../../../../scripts/release/v2/verify');
    expect(() => verifyResults(candidate, [requirement], [passed()], untrusted)).toThrow();
  });
  it('rejects an empty required suite set instead of vacuous success', async () => {
    const { verifyResults } = await import('../../../../scripts/release/v2/verify');
    expect(() => verifyResults(candidate, [], [], context)).toThrow();
  });
  it('checks the bytes again and refuses an artifact changed by a test job', async () => {
    const { verifyCandidateArtifact } = await import('../../../../scripts/release/v2/verify');
    const root = await mkdtemp(path.join(tmpdir(), 'flow-frozen-'));
    roots.push(root);
    await writeFile(path.join(root, 'index.html'), 'approved build');
    const frozen = { ...candidate, artifactDigest: (await hashArtifact(root)).digest };
    await expect(verifyCandidateArtifact(frozen, root)).resolves.toBeUndefined();
    await writeFile(path.join(root, 'index.html'), 'modified after test');
    await expect(verifyCandidateArtifact(frozen, root)).rejects.toThrow(/changed|一致|bytes/);
  });
});

describe('deployment truth after a failed report', () => {
  const actual = { id: '501', sourceCommit: '1'.repeat(40), status: 'success' };
  it('keeps the actual new deployment when the old verified manifest remains', async () => {
    const { reconcileDeployment } = await import('../../../../scripts/release/v2/record');
    expect(
      reconcileDeployment(actual, {
        deploymentId: '500',
        sourceCommit: '2'.repeat(40),
        state: 'verified',
      }),
    ).toEqual({ state: 'deployed-unverified', deploymentId: '501', sourceCommit: '1'.repeat(40) });
  });
  it('preserves a failed smoke instead of reporting publication verified', async () => {
    const { reconcileDeployment } = await import('../../../../scripts/release/v2/record');
    expect(
      reconcileDeployment(actual, {
        deploymentId: '501',
        sourceCommit: '1'.repeat(40),
        state: 'deployed-verification-failed',
      }).state,
    ).toBe('deployed-verification-failed');
  });
  it('returns unknown for missing truth or a same-ID source mismatch', async () => {
    const { reconcileDeployment } = await import('../../../../scripts/release/v2/record');
    expect(reconcileDeployment(undefined, undefined).state).toBe('unknown');
    expect(
      reconcileDeployment(actual, {
        deploymentId: '501',
        sourceCommit: '2'.repeat(40),
        state: 'verified',
      }).state,
    ).toBe('unknown');
  });
});

it('refuses a result emitted by a different same-run producer job', async () => {
  const { verifyResults } = await import('../../../../scripts/release/v2/verify');
  const result = passed();
  result.jobId = '402';
  expect(() => verifyResults(candidate, [requirement], [result], context)).toThrow();
});
