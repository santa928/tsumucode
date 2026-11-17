// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { parse } from 'yaml';

const fixture = vi.hoisted(() => {
  const recipe = { sourceCommit: 'a'.repeat(40), basePath: '/tsumucode/' };
  const capturedBaseline = { synthetic: 'captured-parent' };
  return {
    recipe,
    capturedBaseline,
    guard: vi.fn(async () => undefined),
    bundle: {
      candidate: { repository: 'santa928/tsumucode', runId: '123', recipe },
      capturedBaseline,
    },
  };
});
vi.mock('../../../../scripts/release/v2/runner', async (original) => ({
  ...(await original<object>()),
  loadExecutionBundle: async () => fixture.bundle,
}));
vi.mock('../../../../scripts/release/v2/candidate', async (original) => ({
  ...(await original<object>()),
  readRecipe: async () => fixture.recipe,
}));
vi.mock('../../../../scripts/release/v2/retiredMovementFiles', () => ({
  assertRetiredMovementParent: fixture.guard,
}));
vi.mock('../../../../scripts/release/v2/verify', async (original) => ({
  ...(await original<object>()),
  verifyCandidateArtifact: async () => {
    throw Error('synthetic artifact boundary');
  },
}));
import { qualifyCurrentRelease } from '../../../../scripts/release/v2/qualify';

const environment = {
  GITHUB_REPOSITORY: 'santa928/tsumucode',
  GITHUB_RUN_ID: '123',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_JOB: 'aggregate',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
};

it('rejects missing Source policy before final qualification', async () => {
  await expect(qualifyCurrentRelease('/synthetic', environment)).rejects.toThrow(
    'Missing retirement policy',
  );
  expect(fixture.guard).not.toHaveBeenCalled();
});

it('passes the unchanged same-run captured object to the policy guard', async () => {
  fixture.guard.mockClear();
  await expect(qualifyCurrentRelease('/synthetic', environment, 'python-first-v1')).rejects.toThrow(
    'synthetic artifact boundary',
  );
  expect(fixture.guard).toHaveBeenCalledExactlyOnceWith('/synthetic', fixture.capturedBaseline);
});

it('stops qualification if the captured parent fails the retirement guard', async () => {
  fixture.guard.mockClear();
  fixture.guard.mockRejectedValueOnce(Error('synthetic invalid parent'));
  await expect(
    qualifyCurrentRelease('/synthetic', environment, 'python-first-v1'),
  ).rejects.toThrow('synthetic invalid parent');
  expect(fixture.guard).toHaveBeenCalledExactlyOnceWith('/synthetic', fixture.capturedBaseline);
});

it('pins policy in each official build entry and final qualification command', async () => {
  const pages = parse(await readFile('.github/workflows/pages.yml', 'utf8')) as {
    jobs: { build: { steps: Array<{ run?: string }> } };
  };
  const checks = parse(await readFile('.github/workflows/release-v2-checks.yml', 'utf8')) as {
    jobs: { aggregate: { steps: Array<{ run?: string }> } };
  };
  const build = pages.jobs.build.steps.map((step) => step.run ?? '').join('\n');
  const aggregate = checks.jobs.aggregate.steps.map((step) => step.run ?? '').join('\n');
  for (const command of ['prepare', 'stage-content', 'freeze', 'candidate'])
    expect(build).toContain(`release:flow -- ${command} --retirement-policy python-first-v1`);
  expect(aggregate).toContain('release:flow -- qualify --retirement-policy python-first-v1');
});
