// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { releaseFixture as setup } from './releaseFixture';
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
