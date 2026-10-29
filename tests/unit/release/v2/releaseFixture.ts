// @vitest-environment node
import { InventorySchema } from '../../../../scripts/release/v2/schema';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
import { hashValue } from '../../../../scripts/release/v2/identity';
export function releaseFixture() {
  const inventory = InventorySchema.parse({
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
  const capturedBaseline = {
    proof,
    baseline: {
      deploymentId: '501',
      sourceCommit: proof.sourceCommit,
      artifactDigest: proof.artifactDigest,
      sourceRecordDigest: hashValue(proof),
      inventory,
    },
  };
  const files = [{ path: 'catalog-v3.json', bytes: 2, sha256: 'a'.repeat(64) }];
  const publicContent = { digest: hashValue(files), files };
  const plan = planRelease(inventory, capturedBaseline.baseline),
    executionPlan = createExecutionPlan(
      plan,
      TEST_SUITES.map(({ suite, producerJobId, project }) => ({
        suite,
        producerJobId,
        project,
        tests: [{ key: suite + '/case', exerciseIds: [] }],
      })),
      hashValue(publicContent),
    );
  const candidate = {
    schemaVersion: 1,
    repository: 'owner/site',
    runId: '101',
    buildJobId: 'build',
    buildAttempt: 1,
    artifactId: '301',
    artifactDigest: '1'.repeat(64),
    planDigest: hashValue({ plan, executionPlan }),
    recipe: {
      sourceCommit: '2'.repeat(40),
      sourceTree: '3'.repeat(40),
      lockDigest: '4'.repeat(64),
      workflowDigest: '5'.repeat(64),
      policyDigest: '6'.repeat(64),
      toolchain: 'fixed',
      basePath: '/site/',
    },
  };
  return {
    snapshot: { schemaVersion: 1, inventory, plan, publicContent },
    capturedBaseline,
    executionPlan,
    candidate,
  };
}
