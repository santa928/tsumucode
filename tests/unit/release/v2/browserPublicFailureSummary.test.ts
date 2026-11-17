// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  summarizeBrowserPublicFailures,
  writeBrowserPublicFailureSummary,
} from '../../../../scripts/release/v2/browserPublicFailureSummary';

import { parseTestList } from '../../../../scripts/release/v2/testManifest';

const specFile = 'tests/e2e/manifest-progress-roundtrip.spec.ts';
const secret = 'SYNTHETIC_PRIVATE_REPORT_VALUE';
const manifest = {
  suite: 'browser-public',
  producerJobId: 'public_boundary',
  project: 'chromium',
  tests: ['failed-id', 'timeout-id', 'pass-id'].map((id) => ({
    key: id + '/chromium',
    exerciseIds: [],
  })),
};
function spec(id: string, status: string, file = 'manifest-progress-roundtrip.spec.ts') {
  return {
    id,
    file,
    title: secret,
    line: 12,
    column: 3,
    tests: [
      {
        expectedStatus: 'passed',
        projectName: 'chromium',
        status: status === 'passed' ? 'expected' : 'unexpected',
        results: [
          {
            status,
            retry: 0,
            error: { message: secret, stack: secret },
            attachments: [{ body: secret }],
            stdout: [{ text: secret }],
          },
        ],
      },
    ],
  };
}
const report = (...specs: ReturnType<typeof spec>[]) => ({ suites: [{ suites: [{ specs }] }] });

it('固定manifestに属する失敗とtimeoutを投影し、入力の本文や添付を除く', () => {
  const result = summarizeBrowserPublicFailures(
    report(
      spec('failed-id', 'failed', '/workspace/' + specFile),
      spec('timeout-id', 'timedOut'),
      spec('pass-id', 'passed'),
    ),
    manifest,
    '/workspace',
  );
  expect(result).toEqual({
    schemaVersion: 1,
    engine: 'chromium',
    failures: [
      { testId: 'failed-id', kind: 'failed', location: { file: specFile, line: 12, column: 3 } },
      { testId: 'timeout-id', kind: 'timedOut', location: { file: specFile, line: 12, column: 3 } },
    ],
  });
  expect(JSON.stringify(result)).not.toContain(secret);
});

it('実Playwright JSONの初回失敗を固定したtest IDと照合する', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'browser-public-reporter-'));
  try {
    const config = path.join(root, 'playwright.config.mjs');
    await writeFile(config, "export default { testDir: '.', projects: [{ name: 'chromium' }] };\n");
    await writeFile(
      path.join(root, path.basename(specFile)),
      [
        'import { test, expect } from ' +
          JSON.stringify(path.resolve('node_modules/@playwright/test/index.mjs')) +
          ';',
        "test('sample', async () => { expect('SYNTHETIC_PRIVATE_REPORT_VALUE').toBe('expected'); });",
      ].join('\n'),
    );
    const run = (output: string, flags: string[]) =>
      spawnSync(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config=' + config,
          '--project=chromium',
          '--reporter=json',
          '--output=' + path.join(root, 'test-results'),
          ...flags,
        ],
        {
          encoding: 'utf8',
          timeout: 10_000,
          env: { ...process.env, CI: 'true', PLAYWRIGHT_JSON_OUTPUT_FILE: output },
        },
      );
    const listFile = path.join(root, 'list.json');
    const list = run(listFile, ['--list']);
    expect(list.status, list.stderr).toBe(0);
    const collected = parseTestList(
      JSON.parse(await readFile(listFile, 'utf8')) as unknown,
      'browser-public',
      'public_boundary',
      'chromium',
    );
    const release = path.join(root, '.release-v2');
    const checks = path.join(release, 'checks');
    await mkdir(checks, { recursive: true });
    await writeFile(
      path.join(release, 'execution-plan.json'),
      JSON.stringify({ testManifests: [collected] }),
    );
    const failed = run(path.join(checks, 'browser-public.json'), ['--workers=1', '--retries=0']);
    expect(failed.status, failed.stderr).toBe(1);
    expect(await readFile(path.join(checks, 'browser-public.json'), 'utf8')).toContain(secret);
    await writeBrowserPublicFailureSummary(root);
    const contents = await readFile(
      path.join(checks, 'browser-public-failure-summary.json'),
      'utf8',
    );
    expect(JSON.parse(contents)).toEqual({
      schemaVersion: 1,
      engine: 'chromium',
      failures: [
        {
          testId: collected.tests[0]!.key.split('/')[0],
          kind: 'failed',
          location: { file: specFile, line: 2, column: 5 },
        },
      ],
    });
    expect(contents).not.toContain(secret);
    await expect(
      readFile(path.join(release, 'receipts/browser-public-1.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 25_000);

it('許可外パスを出さず、不明ID・重複・欠損・破損を固定の状態へ畳む', () => {
  const summarize = (input: unknown) =>
    summarizeBrowserPublicFailures(input, manifest, '/workspace');
  const failed = spec('failed-id', 'failed', '/outside/' + secret);
  const timedOut = spec('timeout-id', 'timedOut', 'unrelated.spec.ts');
  const passed = spec('pass-id', 'passed');
  expect(summarize(report(failed, timedOut, passed)).failures).toEqual([
    { testId: 'failed-id', kind: 'failed', location: null },
    { testId: 'timeout-id', kind: 'timedOut', location: null },
  ]);
  for (const input of [
    report(spec(secret, 'failed'), timedOut, passed),
    report(failed, failed, passed),
    report(failed, passed),
    { suites: [{ specs: secret }] },
  ]) {
    expect(summarize(input).failures).toEqual([{ kind: 'report-invalid' }]);
  }
  expect(summarize({ errors: [{ message: secret }], suites: [] }).failures).toEqual([
    { kind: 'report-error' },
  ]);
});

it('実行中のskipとテスト外エラーを区別し、既知の失敗IDも残す', () => {
  const skipped = spec('timeout-id', 'skipped');
  skipped.tests[0]!.expectedStatus = 'skipped';
  skipped.tests[0]!.status = 'skipped';
  const result = summarizeBrowserPublicFailures(
    { ...report(spec('failed-id', 'failed'), skipped), errors: [{ message: secret }] },
    manifest,
    '/workspace',
  );
  expect(result.failures.map(({ kind }) => kind)).toEqual(['report-error', 'failed', 'skipped']);
  expect(result.failures).toContainEqual({
    testId: 'timeout-id',
    kind: 'skipped',
    location: { file: specFile, line: 12, column: 3 },
  });
  expect(JSON.stringify(result)).not.toContain(secret);
});

it('入力欠損時の要約を診断専用ファイルに書き、receiptを作らない', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'browser-public-summary-'));
  try {
    await mkdir(path.join(root, '.release-v2'));
    await writeFile(
      path.join(root, '.release-v2/execution-plan.json'),
      JSON.stringify({ testManifests: [manifest] }),
    );
    await writeBrowserPublicFailureSummary(root);
    const contents = await readFile(
      path.join(root, '.release-v2/checks/browser-public-failure-summary.json'),
      'utf8',
    );
    expect(JSON.parse(contents)).toEqual({
      schemaVersion: 1,
      engine: 'chromium',
      failures: [{ kind: 'report-unavailable' }],
    });
    await expect(
      readFile(path.join(root, '.release-v2/receipts/browser-public-1.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('元のrun-suiteを必須のまま維持し、失敗時だけ別stepで要約を生成する', async () => {
  const workflow = parse(await readFile('.github/workflows/release-v2-checks.yml', 'utf8')) as {
    jobs: Record<
      string,
      {
        steps?: {
          id?: string;
          name?: string;
          run?: string;
          if?: string;
          'continue-on-error'?: boolean;
          with?: { path?: string; 'retention-days'?: number };
        }[];
      }
    >;
  };
  const steps = workflow.jobs['public_boundary']!.steps!;
  const execute = steps.find((step) => step.id === 'browser_public')!;
  expect(execute.run?.trim()).toBe(
    './scripts/docker-compose.sh run --rm -e BASE_PATH -e GITHUB_REPOSITORY -e GITHUB_RUN_ID -e GITHUB_JOB -e GITHUB_RUN_ATTEMPT -e GITHUB_SHA -e GITHUB_EVENT_NAME -e GITHUB_REF app npm run release:flow -- run-suite --suite browser-public --output .release-v2/receipts/browser-public-$GITHUB_RUN_ATTEMPT.json',
  );
  expect(execute.if).toBeUndefined();
  expect(execute['continue-on-error']).toBeUndefined();
  const root = await mkdtemp(path.join(os.tmpdir(), 'browser-public-step-'));
  try {
    await mkdir(path.join(root, 'scripts'));
    await writeFile(path.join(root, 'scripts/docker-compose.sh'), '#!/bin/sh\nexit 7\n', {
      mode: 0o755,
    });
    // 実workflowのrunブロックが子プロセスの失敗を成功へ変えないことを確認する。
    const original = spawnSync('sh', ['-e', '-c', execute.run!], { cwd: root });
    expect(original.status).toBe(7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const summary = steps.find((step) => step.name === 'Summarize browser-public failure')!;
  expect(summary.if).toBe("failure() && steps.browser_public.outcome == 'failure'");
  expect(summary['continue-on-error']).toBe(true);
  expect(summary.run).not.toMatch(/receipts|reports\//u);
  const upload = steps.find((step) => step.name === 'Preserve failed verification diagnostics')!;
  expect(steps.indexOf(execute)).toBeLessThan(steps.indexOf(summary));
  expect(steps.indexOf(summary)).toBeLessThan(steps.indexOf(upload));
  expect(upload.with?.path?.split('\n')).toContain(
    '.release-v2/checks/browser-public-failure-summary.json',
  );
  expect(upload.with?.['retention-days']).toBe(7);
  for (const [job, definition] of Object.entries(workflow.jobs)) {
    if (job !== 'public_boundary') {
      expect((definition.steps ?? []).some((step) => step.name === summary.name)).toBe(false);
    }
  }
});
