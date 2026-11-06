// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { PR_VISUAL_ARGS, PR_VISUAL_TITLES, verifyPrVisualList } from '../../../scripts/ci/prVisual';

interface Step {
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  'continue-on-error'?: boolean;
  with?: Record<string, unknown>;
}
interface Job {
  if?: string;
  needs?: string[];
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  'continue-on-error'?: boolean;
  steps: Step[];
}
const workflow = parse(readFileSync('.github/workflows/pages.yml', 'utf8')) as {
  jobs: Record<string, Job>;
};

function report(executed: boolean) {
  return {
    errors: [],
    stats: { expected: 6, unexpected: 0, skipped: 0, flaky: 0 },
    suites: [
      {
        specs: PR_VISUAL_TITLES.map((title, index) => ({
          id: `test-${String(index)}`,
          title,
          tests: [
            {
              projectName: 'chromium',
              expectedStatus: 'passed',
              status: 'expected',
              results: executed ? [{ status: 'passed', retry: 0 }] : [],
            },
          ],
        })),
      },
    ],
  };
}

/** 実entrypointを動かし、Browserだけを合成CLIへ置換して失敗伝播を確認する。 */
function runFixture(mode: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pr-visual-'));
  try {
    mkdirSync(path.join(root, 'node_modules/@playwright/test'), { recursive: true });
    writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    const list = report(false);
    const result = report(true);
    if (mode === 'missing') list.suites[0]!.specs.pop();
    if (mode === 'skip') {
      result.stats.skipped = 1;
      result.stats.expected = 5;
      result.suites[0]!.specs[0]!.tests[0]!.results = [];
    }
    if (mode === 'retry') result.suites[0]!.specs[0]!.tests[0]!.results[0]!.retry = 1;
    if (mode === 'wrong-project') result.suites[0]!.specs[0]!.tests[0]!.projectName = 'webkit';
    writeFileSync(path.join(root, 'list.json'), JSON.stringify(list));
    writeFileSync(path.join(root, 'result.json'), JSON.stringify(result));
    writeFileSync(
      path.join(root, 'node_modules/@playwright/test/cli.js'),
      `
      import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
      const args = process.argv.slice(2);
      appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
      if (args.includes('--list')) process.stdout.write(readFileSync('list.json'));
      else {
        writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, readFileSync('result.json'));
        if (process.env.FIXTURE_MODE === 'failure') process.exit(43);
      }
    `,
    );
    const execution = spawnSync(
      process.execPath,
      [
        '--import',
        path.resolve('node_modules/tsx/dist/loader.mjs'),
        path.resolve('scripts/ci/prVisual.ts'),
      ],
      { cwd: root, encoding: 'utf8', env: { ...process.env, FIXTURE_MODE: mode } },
    );
    const calls = readFileSync(path.join(root, 'calls.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    return { ...execution, calls };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('PRの早期Visual検査', () => {
  it('全PRで同じcheckoutの同一run previewを再利用し、公開graphとは分離する', () => {
    const job = workflow.jobs.pr_visual!;
    for (const event of ['pull_request', 'push', 'workflow_dispatch']) {
      expect(runInNewContext(job.if!, { github: { event_name: event } })).toBe(
        event === 'pull_request',
      );
    }
    expect(job.needs).toEqual(['resolve', 'fast']);
    expect(job.permissions).toEqual({ contents: 'read' });
    expect(job['continue-on-error']).not.toBe(true);
    const checkout = job.steps.find(({ uses }) => uses?.startsWith('actions/checkout@'))!;
    expect(checkout.with?.ref).toBe('${{ needs.resolve.outputs.checkout_sha }}');
    const fast = workflow.jobs.fast!;
    expect(fast.outputs?.preview_artifact_id).toBe(
      "${{ steps.static_preview.outputs['artifact-id'] }}",
    );
    expect(fast.steps.find(({ id }) => id === 'static_preview')?.uses).toContain(
      'upload-artifact@',
    );
    const download = job.steps.find(({ uses }) => uses?.includes('download-artifact@'))!;
    expect(download.with).toEqual({
      'artifact-ids': '${{ needs.fast.outputs.preview_artifact_id }}',
      path: '.',
    });
    const identity = job.steps.findIndex(({ run }) =>
      run?.includes('cmp - static-preview-identity.txt'),
    );
    const execute = job.steps.findIndex(({ run }) => run?.includes('scripts/ci/prVisual.ts'));
    expect(identity).toBeGreaterThan(job.steps.indexOf(download));
    expect(execute).toBeGreaterThan(identity);
    for (const step of job.steps.slice(0, execute + 1)) {
      expect(step.if).toBeUndefined();
      expect(step['continue-on-error']).not.toBe(true);
    }
    const source = JSON.stringify(job);
    expect(source).toContain('--cpus 2 --memory 4g --memory-swap 4g');
    expect(source).not.toMatch(/content:compile|build:app|release:flow|update-snapshots/u);
    expect(workflow.jobs.qualification!.needs).toBe('build');
    expect(workflow.jobs.qualification).not.toHaveProperty('if');
  });

  it('同じ実specの収集で6画面・3幅を保証する（Browserは起動しない）', () => {
    const list = execFileSync(
      process.execPath,
      ['node_modules/@playwright/test/cli.js', ...PR_VISUAL_ARGS, '--list', '--reporter=json'],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    );
    expect(verifyPrVisualList(JSON.parse(list) as unknown).tests).toHaveLength(6);
  });

  it.each([false, true])('workflowの実shellはpreview identityの不一致=%sを拒否する', (mismatch) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pr-visual-identity-'));
    try {
      writeFileSync(path.join(root, 'git'), '#!/bin/sh\nprintf "fixture-sha\\nfixture-tree\\n"\n');
      chmodSync(path.join(root, 'git'), 0o700);
      writeFileSync(
        path.join(root, 'static-preview-identity.txt'),
        mismatch ? 'different-sha\nfixture-tree\n' : 'fixture-sha\nfixture-tree\n',
      );
      const command = workflow.jobs.pr_visual!.steps.find(({ run }) =>
        run?.includes('cmp - static-preview-identity.txt'),
      )!.run!;
      const execution = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PATH: root + path.delimiter + (process.env['PATH'] ?? '') },
      });
      expect(execution.status).toBe(mismatch ? 1 : 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['pass', 'missing', 'failure', 'skip', 'retry', 'wrong-project'])(
    '実entrypoint: %sを正しく判定する',
    (mode) => {
      const execution = runFixture(mode);
      expect(execution.status, execution.stderr).toBe(mode === 'pass' ? 0 : 1);
      expect(execution.calls).toHaveLength(mode === 'missing' ? 1 : 2);
      if (mode !== 'missing') {
        expect(execution.calls[1]).toEqual([
          ...PR_VISUAL_ARGS,
          '--workers=1',
          '--retries=0',
          '--trace=retain-on-failure',
          '--reporter=list,json',
          '--output=test-results/pr-visual-artifacts',
        ]);
      }
    },
  );
});
