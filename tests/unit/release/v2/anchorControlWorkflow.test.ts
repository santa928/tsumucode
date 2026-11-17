// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/anchor-control-checks.yml', 'utf8')) as {
  on: { pull_request: { paths: string[] }; push: { branches: string[]; paths: string[] } };
  permissions: Record<string, string>;
  jobs: Record<
    string,
    {
      'runs-on': string;
      if?: unknown;
      'continue-on-error'?: unknown;
      steps: {
        name?: string;
        run?: string;
        env?: Record<string, string>;
        if?: unknown;
        'continue-on-error'?: unknown;
      }[];
    }
  >;
};

it('runs control checks on matching PR and main changes without publication permissions', () => {
  expect(workflow.on.push.branches).toEqual(['main']);
  expect(workflow.on.pull_request.paths).toEqual(workflow.on.push.paths);
  expect(workflow.on.push.paths).toEqual(
    expect.arrayContaining([
      '.github/workflows/anchor-control-checks.yml',
      'scripts/release/v2/anchor-control/**',
      'tests/local/anchorCheckoutNonDestructive.test.py',
      'tests/unit/release/v2/anchorCheckoutInput.test.py',
      'tests/unit/release/v2/anchorDirectOutput.test.py',
      'tests/unit/release/v2/anchorMetadataGuard.test.py',
      'tests/unit/release/v2/anchorRunningJob.test.py',
      'tests/unit/release/v2/anchorControlWorkflow.test.ts',
    ]),
  );
  expect(workflow.permissions).toEqual({ contents: 'read' });
  expect(Object.keys(workflow.jobs)).toEqual(['checks']);
});

it('requires Python tests and pinned-image Docker controls without suppressing failure', () => {
  const { checks } = workflow.jobs;
  if (!checks) throw Error('anchor control checks job is missing');
  expect(checks['runs-on']).toBe('ubuntu-24.04');
  expect(checks.if).toBeUndefined();
  expect(checks['continue-on-error']).toBeUndefined();
  expect(checks.steps.every((step) => step.if === undefined)).toBe(true);
  expect(checks.steps.every((step) => step['continue-on-error'] === undefined)).toBe(true);
  const unit = checks.steps.find((step) => step.name === 'Run standard-library control tests')!;
  expect(unit.run?.trim()).toBe(
    [
      'set -eu',
      ...[
        'anchorCheckoutInput',
        'anchorMetadataGuard',
        'anchorDirectOutput',
        'anchorRunningJob',
      ].map((name) => `python3 -I tests/unit/release/v2/${name}.test.py`),
    ].join('\n'),
  );
  const docker = checks.steps.find(
    (step) => step.name === 'Run isolated non-destructive Docker controls',
  )!;
  expect(docker.env?.ANCHOR_TEST_IMAGE).toBe(
    'node@sha256:4e9cb555d708e0829c9d93e5eeae9dfab0617b832ca436a690680e0fca735ef5',
  );
  expect(docker.run?.trim()).toBe(
    [
      'set -eu',
      'docker pull "$ANCHOR_TEST_IMAGE"',
      'python3 -I tests/local/anchorCheckoutNonDestructive.test.py',
    ].join('\n'),
  );
});
