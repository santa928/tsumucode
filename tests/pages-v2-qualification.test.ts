// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
type Job = {
  needs?: string | string[];
  uses?: string;
  strategy?: { ['max-parallel']?: number; matrix?: { suite?: string[] } };
  steps?: { uses?: string; with?: Record<string, unknown>; run?: string; name?: string }[];
  permissions?: Record<string, string>;
  if?: string;
};
function read(file: string) {
  return parse(readFileSync(file, 'utf8')) as {
    on: Record<string, unknown>;
    jobs: Record<string, Job>;
  };
}
describe('same-run migration qualification graph', () => {
  it('downloads only caller-produced same-run artifact IDs and keeps browser work in one queue', () => {
    const workflow = read('.github/workflows/release-v2-checks.yml');
    expect(workflow.on).toHaveProperty('workflow_call');
    for (const name of ['unit', 'browser', 'public_boundary', 'performance', 'aggregate']) {
      const job = workflow.jobs[name]!;
      expect(job).toBeDefined();
      expect(job.permissions).toEqual({ contents: 'read' });
      const downloads = job.steps!.filter((step) => step.uses?.includes('download-artifact'));
      expect(downloads.length).toBeGreaterThanOrEqual(2);
      for (const step of downloads) {
        expect(step.with).not.toHaveProperty('run-id');
        expect(step.with).not.toHaveProperty('github-token');
      }
    }
    expect(workflow.jobs.browser!.strategy?.['max-parallel']).toBe(1);
    expect(workflow.jobs.boundary!.uses).toBe('./.github/workflows/local-runtime.yml');
    expect(workflow.jobs.aggregate!.if).toContain('always()');
    expect(workflow.jobs.aggregate!.needs).toEqual(
      expect.arrayContaining(['unit', 'browser', 'public_boundary', 'performance', 'boundary']),
    );
    expect(JSON.stringify(workflow)).not.toContain('deploy-pages');
  });
  it('Native reusable path keeps the actual isolation, restart and negative tests before receipts', () => {
    const native = read('.github/workflows/local-runtime.yml');
    expect(native.on).toHaveProperty('workflow_call');
    const steps = native.jobs.boundary!.steps!,
      commands = steps.map((step) => step.run ?? '').join('\n');
    for (const file of [
      'python-acceptance.mjs',
      'next-form-http-acceptance.mjs',
      'next-form-drain-acceptance.mjs',
      'next-weather-stream-acceptance.mjs',
      'resident-restart-acceptance.mjs',
      'output-fault-acceptance.mjs',
      'python-practice-http-fault-acceptance.mjs',
    ])
      expect(commands).toContain(file);
    const receipt = steps.findIndex(
      (step) => step.name === 'Bind native observations to the same-run candidate',
    );
    expect(receipt).toBeGreaterThan(
      steps.findIndex(
        (step) => step.name === 'Verify output failure and preparation shutdown at HTTP boundary',
      ),
    );
    expect(steps[receipt]!.run).toContain('observe-native');
  });
});
