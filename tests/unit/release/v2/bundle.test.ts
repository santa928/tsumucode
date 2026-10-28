// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InventorySchema } from '../../../../scripts/release/v2/schema';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
import { hashValue } from '../../../../scripts/release/v2/identity';
function setup() {
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
  const plan = planRelease(inventory),
    executionPlan = createExecutionPlan(
      plan,
      TEST_SUITES.map(({ suite, producerJobId, project }) => ({
        suite,
        producerJobId,
        project,
        tests: [{ key: suite + '/case', exerciseIds: [] }],
      })),
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
  return { snapshot: { schemaVersion: 1, inventory, plan }, executionPlan, candidate };
}
describe('immutable release execution bundle', () => {
  it('binds candidate to the independently reproducible source obligations', async () => {
    const { validateExecutionBundle } = await import('../../../../scripts/release/v2/runner');
    expect(validateExecutionBundle(setup()).candidate.buildJobId).toBe('build');
  });
  it.each(['plan', 'inventory', 'execution', 'candidate-plan', 'producer'])(
    'rejects %s substitution',
    async (failure) => {
      const { validateExecutionBundle } = await import('../../../../scripts/release/v2/runner');
      const input = setup();
      if (failure === 'plan') input.snapshot.plan.targets.pop();
      if (failure === 'inventory') input.snapshot.inventory.courses[0]!.revision = '2';
      if (failure === 'execution') input.executionPlan.requirements.pop();
      if (failure === 'candidate-plan') input.candidate.planDigest = hashValue(input.snapshot.plan);
      if (failure === 'producer') input.candidate.buildJobId = 'unit';
      expect(() => validateExecutionBundle(input)).toThrow();
    },
  );
});
