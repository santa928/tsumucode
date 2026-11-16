import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

it('keeps the synthetic WebKit diagnosis scoped and uploads only the fixed summary', () => {
  const workflow = parse(
    readFileSync('.github/workflows/diagnostic-manifest-webkit.yml', 'utf8'),
  ) as {
    permissions: Record<string, string>;
    jobs: {
      diagnose: {
        if: string;
        permissions: Record<string, string>;
        steps: Array<{ name?: string; run?: string; with?: Record<string, unknown> }>;
      };
    };
  };
  expect(workflow.permissions).toEqual({});
  expect(workflow.jobs.diagnose.permissions).toEqual({ contents: 'read' });
  expect(workflow.jobs.diagnose.if).toContain('github.event.pull_request.draft == true');
  expect(workflow.jobs.diagnose.if).toContain('codex/manifest-webkit-diagnostics-main');
  expect(workflow.jobs.diagnose.if).toContain('5eb356fc5ca21c6b2c7cb7b7c1cd4080d3f5f1f3');
  const test = workflow.jobs.diagnose.steps.find(
    (step) => step.name === 'Execute exactly two WebKit learning tests',
  )?.run;
  expect(test).toContain('manifest-learning.spec.ts');
  expect(test).toContain('--config=playwright.qualification.config.ts --project=webkit');
  expect(test).toContain('python-practice/python-practice-ch0[23]-l01 actual learning UI');
  expect(test).toContain('--workers=1 --retries=0 --reporter=json');
  const upload = workflow.jobs.diagnose.steps.find(
    (step) => step.name === 'Preserve fixed diagnostic summary only',
  );
  expect(upload?.with?.['path']).toBe('.release-v2/diagnostic-summary.json');
});
