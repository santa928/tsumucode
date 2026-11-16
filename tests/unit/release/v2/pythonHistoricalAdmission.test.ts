// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCourse } from '../../../../scripts/content/compileCourse';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
import { qualifyRelease } from '../../../../scripts/release/v2/admission';
import type { ReleaseInventory } from '../../../../scripts/release/v2/schema';
let inventory: ReleaseInventory;
let receipts: unknown;
beforeAll(async () => {
  inventory = buildInventory(
    await Promise.all(
      ['python-practice', 'python-oop'].map((id) => compileCourse('content/' + id)),
    ),
  );
  for (const course of inventory.courses) course.publicationStatus = 'published';
  receipts = JSON.parse(await readFile('docs/quality/python-historical-acceptance.json', 'utf8'));
});
function setup(inventory: ReleaseInventory, historicalAcceptances: unknown) {
  const previousInventory = structuredClone(inventory);
  for (const course of previousInventory.courses) course.publicationStatus = 'draft';
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
    inventoryDigest: hashValue(previousInventory),
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
      inventory: previousInventory,
    },
  };
  const plan = planRelease(inventory, baseline.baseline);
  const manifests = TEST_SUITES.map(({ suite, producerJobId, project }) => ({
    suite,
    producerJobId,
    project,
    tests: [
      {
        key: suite + '/case',
        exerciseIds: ['browser-chromium-1', 'native-python'].includes(suite)
          ? inventory.courses.flatMap((course) =>
              course.lessons.flatMap((lesson) => lesson.exercises.map((exercise) => exercise.id)),
            )
          : [],
        lessonKeys: ['browser-chromium-1', 'browser-firefox', 'browser-webkit'].includes(suite)
          ? inventory.courses.flatMap((course) =>
              course.lessons.map((lesson) => course.id + '/' + lesson.id),
            )
          : [],
      },
    ],
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
    historicalAcceptances,
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
        python_fixtures: 'success',
      },
    },
  };
}

// 技術結果は契約テスト用の合成fixture。実runtime/Browserの成功証拠ではない。
describe('Python歴史受入も最終same-run gateから免除しない', () => {
  it('合成同一run結果と限定認証の両方が揃う場合だけ歴史summaryを返す', () => {
    const result = qualifyRelease(setup(structuredClone(inventory), receipts));
    expect(result.status).toBe('qualified');
    expect(result.content).toMatchObject({ status: 'historical', newlyApprovedLessons: [] });
    expect(result.content.historicallyAcceptedLessons).toHaveLength(14);
    expect(result.content.pythonHistoricalAcceptances).toHaveLength(2);
  });
  it.each([
    'history-missing',
    'native-failed',
    'browser-missing',
    'parent-moved',
    'main-moved',
    'old-run',
  ])('%s は歴史受入を渡しても拒否する', (failure) => {
    const input = setup(structuredClone(inventory), receipts);
    if (failure === 'history-missing') input.historicalAcceptances = [];
    if (failure === 'native-failed') input.context.jobs.boundary = 'failure';
    if (failure === 'browser-missing')
      input.results = input.results.filter((row) => row.suite !== 'browser-firefox');
    if (failure === 'parent-moved') {
      const proof = { ...input.currentBaseline.proof, deploymentId: '999' };
      input.currentBaseline = {
        proof,
        baseline: {
          ...input.currentBaseline.baseline,
          deploymentId: '999',
          sourceRecordDigest: hashValue(proof),
        },
      };
    }
    if (failure === 'main-moved') input.context.currentMainCommit = '0'.repeat(40);
    if (failure === 'old-run') input.results[0]!.runId = '999';
    expect(() => qualifyRelease(input)).toThrow(
      failure === 'parent-moved' ? /Actual published parent changed/ : undefined,
    );
  });
});
