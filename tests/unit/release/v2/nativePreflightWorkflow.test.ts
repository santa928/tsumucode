// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

it('keeps CI diagnostic overlay changes in both Runtime triggers', async () => {
  const workflow = parse(await readFile('.github/workflows/local-runtime.yml', 'utf8')) as {
    on: Record<'push' | 'pull_request', { paths: string[] }>;
  };
  const events = ['push', 'pull_request'] as const;
  const overlay = 'compose.learning.ci-diagnostic.yaml';
  const missing = (triggers: typeof workflow.on) =>
    events.filter((event) => !triggers[event].paths.includes(overlay));

  expect(missing(workflow.on)).toEqual([]);
  for (const removed of events) {
    const changed = {
      ...workflow.on,
      [removed]: { ...workflow.on[removed], paths: workflow.on[removed].paths.filter((item) => item !== overlay) },
    };
    expect(missing(changed)).toEqual([removed]);
  }
});

it.each(['push', 'pull_request'] as const)('%s detects changes in the baked Native test import graph', async (event) => {
  const workflow = parse(await readFile('.github/workflows/local-runtime.yml', 'utf8')) as {
    on: Record<'push' | 'pull_request', { paths: string[] }>;
  };
  const paths: string[] = workflow.on[event].paths;
  for (const changed of [
    'tests/e2e/helpers/editorDocument.ts',
    'tests/e2e/helpers/manifestLearning.ts',
    'tests/local/manifest-next-learning.spec.ts',
    'playwright.learning-native.config.ts',
  ]) expect(paths.some((pattern) => path.matchesGlob(changed, pattern)), changed).toBe(true);
});

it('loads the actual baked Native image before expensive execution, retaining all three real engines', async () => {
  const workflow = parse(await readFile('.github/workflows/local-runtime.yml', 'utf8')) as {
    jobs: { boundary: { steps: { name?: string; if?: string; run?: string }[] } };
  };
  const steps: { name?: string; if?: string; run?: string }[] = workflow.jobs.boundary.steps;
  const early = steps.findIndex((step) => step.name === 'Build Native verification image and check baked imports');
  expect(early).toBeGreaterThan(-1);
  expect(early).toBeLessThan(steps.findIndex((step) => step.name === 'Build fixed learner and trusted services'));
  const preflight = steps[early]!;
  expect(preflight.if).toBeUndefined();
  expect(preflight.run).toContain('--target learning-native-checks');
  expect(preflight.run).toContain('--network none');
  expect(preflight.run).toContain('node scripts/local/native-import-preflight.mjs');
  expect(preflight.run).not.toMatch(/--mount|--volume|\s-v\s/u);
  const match = steps.findIndex((step) => step.name === 'Match baked Native contracts to frozen compiler inventory');
  expect(match).toBeLessThan(steps.findIndex((step) => step.name === 'Start isolated learning stack'));
  expect(steps[match]!.run).toContain('--file .release-v2/native-catalogs/learning-native.json');
  const actual = steps.find((step) => step.name === 'Verify new Native lessons in every required browser engine')!;
  expect(actual.if).toBe("inputs.candidate_artifact_id != ''");
  expect(actual.run).toContain('for engine in chromium firefox webkit; do');
  expect(actual.run).toContain('node scripts/local/manifest-learning-browser-acceptance.mjs "$engine"');
  expect(actual.run).not.toContain('docker build');
  expect(steps.filter((step) => step.run?.includes('--target learning-native-checks'))).toHaveLength(1);
});
