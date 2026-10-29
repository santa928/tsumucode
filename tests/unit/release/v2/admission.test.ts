// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
import { InventorySchema } from '../../../../scripts/release/v2/schema';
const baseInventory = InventorySchema.parse({
  schemaVersion: 1,
  fingerprintVersion: 1,
  courses: [
    {
      id: 'topic',
      revision: '1',
      publicationStatus: 'published',
      runner: 'html-css',
      lessons: [
        {
          id: 'lesson',
          kind: 'standard',
          learnerDigest: 'a'.repeat(64),
          exerciseDigest: 'b'.repeat(64),
          navigationDigest: 'c'.repeat(64),
          persistenceDigest: 'd'.repeat(64),
          exercises: [],
        },
      ],
    },
  ],
});
function setup() {
  const inventory = structuredClone(baseInventory);
  const publicFiles = [{ path: 'catalog-v3.json', bytes: 2, sha256: 'a'.repeat(64) }];
  const publicContent = { digest: hashValue(publicFiles), files: publicFiles };
  const proof = {
    schemaVersion: 1,
    repository: 'owner/site',
    deploymentId: '501',
    sourceCommit: '1'.repeat(40),
    workflowHeadCommit: '2'.repeat(40),
    runId: '500',
    tag: 'refs/tags/tsumucode-release-1',
    tagDigest: 'a'.repeat(64),
    artifactDigest: 'b'.repeat(64),
    artifactDigestFormat: 'legacy-canonical-dist',
    projection: 'authoring',
    inventoryDigest: hashValue(inventory),
    publicContentDigest: 'c'.repeat(64),
    publicFiles: 1,
    observedAt: '2026-10-28T10:00:00Z',
  };
  const baseline = {
    proof,
    baseline: {
      deploymentId: '501',
      sourceCommit: proof.sourceCommit,
      artifactDigest: proof.artifactDigest,
      sourceRecordDigest: hashValue(proof),
      inventory,
    },
  };
  const plan = planRelease(inventory, baseline.baseline);
  const manifests = TEST_SUITES.map(({ suite, producerJobId, project }) => ({
    suite,
    producerJobId,
    project,
    tests: [{ key: suite + '/case', exerciseIds: [] }],
  }));
  const executionPlan = createExecutionPlan(plan, manifests, hashValue(publicContent));
  const recipe = {
    sourceCommit: '3'.repeat(40),
    sourceTree: '4'.repeat(40),
    lockDigest: 'e'.repeat(64),
    workflowDigest: 'f'.repeat(64),
    policyDigest: '1'.repeat(64),
    toolchain: 'fixed',
    basePath: '/site/',
  };
  const candidate = {
    schemaVersion: 1,
    repository: 'owner/site',
    runId: '101',
    buildJobId: 'build',
    buildAttempt: 1,
    artifactDigest: '2'.repeat(64),
    artifactId: '301',
    planDigest: hashValue({ plan, executionPlan }),
    recipe,
  };
  const results = executionPlan.requirements.map((requirement) => ({
    schemaVersion: 1,
    suite: requirement.suite,
    candidateDigest: hashValue(candidate),
    inputDigest: requirement.inputDigest,
    recipeDigest: hashValue(recipe),
    runId: '101',
    jobId: requirement.producerJobId,
    verificationAttempt: 1,
    status: 'passed',
    targets: requirement.targets,
    startedAt: '2026-10-28T12:00:00Z',
    finishedAt: '2026-10-28T12:01:00Z',
    expiresAt: '2026-10-29T12:01:00Z',
    reportDigest: '9'.repeat(64),
  }));
  return {
    inventory,
    publicContent,
    plan,
    executionPlan,
    candidate,
    results,
    capturedBaseline: baseline,
    currentBaseline: baseline,
    contentReceipts: [],
    context: {
      repository: 'owner/site',
      runId: '101',
      sourceCommit: recipe.sourceCommit,
      currentMainCommit: recipe.sourceCommit,
      recipe,
      eventName: 'workflow_dispatch',
      ref: 'refs/heads/main',
      attempt: 1,
      now: '2026-10-28T13:00:00Z',
      jobs: {
        build: 'success',
        unit: 'success',
        browser: 'success',
        public_boundary: 'success',
        performance: 'success',
        boundary: 'success',
      },
    },
  };
}
describe('final same-run admission', () => {
  it('carries unchanged deployed content without granting historical UI approval', async () => {
    const { qualifyRelease } = await import('../../../../scripts/release/v2/admission');
    const result = qualifyRelease(setup());
    expect(result.status).toBe('qualified');
    expect(result.content).toMatchObject({ status: 'maintenance', newlyApprovedLessons: [] });
  });
  it.each([
    'main-moved',
    'parent-moved',
    'suite-missing',
    'failed-job',
    'old-plan',
    'forged-plan',
    'changed-content',
    'wrong-recipe',
    'wrong-build',
  ])('rejects %s', async (failure) => {
    const { qualifyRelease } = await import('../../../../scripts/release/v2/admission');
    const input = setup();
    if (failure === 'main-moved') input.context.currentMainCommit = '0'.repeat(40);
    if (failure === 'parent-moved')
      input.currentBaseline = {
        ...input.currentBaseline,
        proof: { ...input.currentBaseline.proof, deploymentId: '502' },
        baseline: { ...input.currentBaseline.baseline, deploymentId: '502' },
      };
    if (failure === 'suite-missing') input.results.pop();
    if (failure === 'failed-job') input.context.jobs.boundary = 'failure';
    if (failure === 'old-plan') input.candidate.planDigest = hashValue(input.plan);
    if (failure === 'forged-plan') input.executionPlan.requirements.pop();
    if (failure === 'changed-content')
      input.inventory.courses[0]!.lessons[0]!.learnerDigest = '0'.repeat(64);
    if (failure === 'wrong-recipe')
      input.context.recipe = { ...input.context.recipe, lockDigest: '0'.repeat(64) };
    if (failure === 'wrong-build') input.candidate.buildJobId = 'browser';
    expect(() => qualifyRelease(input)).toThrow();
  });
});

it('blocks withdrawn deployed content even when every technical suite passed', async () => {
  const { qualifyRelease } = await import('../../../../scripts/release/v2/admission');
  expect(() =>
    qualifyRelease({
      ...setup(),
      contentWithdrawals: [
        {
          courseId: 'topic',
          lessonId: 'lesson',
          learnerDigest: 'a'.repeat(64),
          sourceCommit: '1'.repeat(40),
          reason: 'known-finding',
        },
      ],
    }),
  ).toThrow(/withdraw/i);
});
