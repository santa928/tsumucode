// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
type Job = {
  needs?: string | string[];
  uses?: string;
  with?: Record<string, unknown>;
  strategy?: { ['max-parallel']?: number; ['fail-fast']?: boolean; matrix?: { suite?: string[] } };
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
  it('buildの固定成果物を各並列producerが同じrunから取得する', () => {
    const caller = read('.github/workflows/pages.yml');
    const qualification = caller.jobs.qualification!;
    expect(qualification.needs).toBe('build');
    expect(qualification.uses).toBe('./.github/workflows/release-v2-checks.yml');
    expect(qualification.with).toEqual({
      candidate_artifact_id: '${{ needs.build.outputs.candidate_artifact_id }}',
      metadata_artifact_id: '${{ needs.build.outputs.metadata_artifact_id }}',
    });
    const checks = read('.github/workflows/release-v2-checks.yml');
    expect(checks.jobs.boundary!.with).toEqual({
      candidate_artifact_id: '${{ inputs.candidate_artifact_id }}',
      metadata_artifact_id: '${{ inputs.metadata_artifact_id }}',
    });
    const native = read('.github/workflows/local-runtime.yml');
    for (const job of [checks.jobs.unit!, checks.jobs.browser!, native.jobs.boundary!]) {
      const downloads = job.steps!.filter((step) => step.uses?.includes('download-artifact'));
      expect(downloads.map((step) => step.with)).toEqual([
        { 'artifact-ids': '${{ inputs.candidate_artifact_id }}', path: 'dist' },
        { 'artifact-ids': '${{ inputs.metadata_artifact_id }}', path: '.release-v2' },
      ]);
    }
  });
  it('downloads only caller-produced same-run artifact IDs and keeps four required browser suites isolated', () => {
    const workflow = read('.github/workflows/release-v2-checks.yml');
    expect(workflow.on).toHaveProperty('workflow_call');
    for (const name of ['unit', 'browser', 'public_boundary', 'performance', 'aggregate']) {
      const job = workflow.jobs[name]!;
      expect(job).toBeDefined();
      expect(job.permissions).toEqual({ contents: 'read' });
      expect(job).not.toHaveProperty('continue-on-error');
      const downloads = job.steps!.filter((step) => step.uses?.includes('download-artifact'));
      expect(downloads.length).toBeGreaterThanOrEqual(2);
      for (const step of downloads) {
        expect(step.with).not.toHaveProperty('run-id');
        expect(step.with).not.toHaveProperty('github-token');
      }
    }
    expect(workflow.jobs.browser!.strategy?.matrix?.suite).toEqual([
      'browser-firefox',
      'browser-chromium-1',
      'browser-chromium-2',
      'browser-webkit',
    ]);
    expect(workflow.jobs.browser!.strategy?.['max-parallel']).toBe(4);
    expect(workflow.jobs.browser!.strategy?.['fail-fast']).toBe(false);
    expect(workflow.jobs.browser!.needs).toBeUndefined();
    expect(workflow.jobs.boundary!.needs).toBeUndefined();
    expect(workflow.jobs.boundary!.uses).toBe('./.github/workflows/local-runtime.yml');
    expect(workflow.jobs.boundary!.permissions).toEqual({ contents: 'read' });
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
