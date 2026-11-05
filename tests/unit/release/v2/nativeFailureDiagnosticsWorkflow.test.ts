// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

it('retains only safe Native failure summaries after a failing Native step, without softening that step', async () => {
  const workflow = parse(await readFile('.github/workflows/local-runtime.yml', 'utf8')) as {
    jobs: {
      boundary: {
        steps: {
          name?: string;
          if?: string;
          run?: string;
          'continue-on-error'?: boolean;
          with?: { path?: string; name?: string };
        }[];
      };
    };
  };
  const steps = workflow.jobs.boundary.steps;
  const execute = steps.findIndex(
    (step) => step.name === 'Verify new Native lessons in every required browser engine',
  );
  const summarize = steps.findIndex((step) => step.name === 'Summarize Native failure diagnostics');
  const upload = steps.findIndex((step) => step.name === 'Preserve Native failure diagnostics');
  const cleanup = steps.findIndex((step) => step.name === 'Stop only Native receipt verifier');
  expect(summarize).toBeGreaterThan(execute);
  expect(upload).toBeGreaterThan(summarize);
  expect(cleanup).toBeGreaterThan(upload);
  expect(steps[execute]!['continue-on-error']).not.toBe(true);
  expect(steps[execute]!.run).not.toMatch(/\|\|\s*(?:true|:)|continue-on-error/u);
  expect(steps[summarize]!.if).toContain('always()');
  expect(steps[upload]!.if).toContain('always()');
  const patterns = steps[upload]!.with!.path!.trim()
    .split('\n')
    .map((value) => value.trim());
  const selected = (file: string) =>
    patterns.some((pattern) =>
      path.matchesGlob(file, pattern.endsWith('/') ? pattern + '**' : pattern),
    );
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    expect(selected(`.release-v2/checks/native-learning-${engine}-failure-summary.json`)).toBe(
      true,
    );
    expect(selected(`.release-v2/native-learning-reports/native-learning-${engine}.json`)).toBe(
      false,
    );
  }
  for (const file of [
    '.release-v2/checks/native-learning-chromium-artifacts/trace.zip',
    '.release-v2/checks/native-learning-chromium-artifacts/private.json',
    '.release-v2/checks/native-learning-chromium-artifacts/error-context.md',
    'test-results/native-learning/source.txt',
  ])
    expect(selected(file), file).toBe(false);
});
