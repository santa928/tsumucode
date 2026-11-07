// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import authoringConfig from '../../../playwright.authoring.config';
import qualificationConfig from '../../../playwright.qualification.config';

describe('qualificationの初回失敗trace', () => {
  it('全Browserの対象を継承し、通信・DOM・画像・source・添付の収集を無効にする', () => {
    expect(qualificationConfig.projects).toEqual(authoringConfig.projects);
    expect(qualificationConfig.testIgnore).toEqual(authoringConfig.testIgnore);
    expect(qualificationConfig.webServer).toEqual(authoringConfig.webServer);
    expect(qualificationConfig.retries).toBe(0);
    expect(qualificationConfig.use?.trace).toEqual({
      mode: 'retain-on-failure',
      screenshots: false,
      snapshots: false,
      sources: false,
      attachments: false,
    });
    expect(authoringConfig.use?.trace).toBe('on-first-retry');
  });

  it('実Playwrightで成功traceを破棄し、初回失敗とtimeoutのtraceだけを残してexit 1を維持する', () => {
    // page/context fixtureを使わず、Browserもserverも起動しない。
    const root = mkdtempSync(path.join(os.tmpdir(), 'qualification-trace-'));
    try {
      const configPath = path.join(root, 'playwright.config.ts');
      writeFileSync(
        configPath,
        [
          `import config from ${JSON.stringify(path.resolve('playwright.qualification.config.ts'))};`,
          `export default { ...config, testDir: ${JSON.stringify(root)},`,
          `outputDir: ${JSON.stringify(path.join(root, 'artifacts'))},`,
          "webServer: undefined, projects: [{ name: 'chromium' }], workers: 1, reporter: 'json' };",
        ].join('\n'),
      );
      writeFileSync(
        path.join(root, 'probe.spec.ts'),
        [
          `import { test, expect } from ${JSON.stringify(path.resolve('node_modules/@playwright/test/index.mjs'))};`,
          "test('pass', async () => { await test.step('passed step', async () => { expect(1).toBe(1); }); });",
          "test('fail', async ({}, info) => {",
          "  await info.attach('excluded-attachment', { body: 'SYNTHETIC_ATTACHMENT_MARKER' });",
          "  await test.step('failed step', async () => { expect(1).toBe(2); });",
          '});',
          "test('timeout', async () => { test.setTimeout(300); await new Promise(() => {}); });",
        ].join('\n'),
      );
      const execution = spawnSync(
        process.execPath,
        ['node_modules/@playwright/test/cli.js', 'test', '--config=' + configPath, '--retries=0'],
        { encoding: 'utf8', timeout: 30_000, env: { ...process.env, CI: 'true' } },
      );
      expect(execution.status, execution.stderr).toBe(1);
      const report = JSON.parse(execution.stdout) as {
        suites: {
          specs: {
            title: string;
            tests: {
              results: {
                status: string;
                retry: number;
                attachments: { name: string; path?: string }[];
              }[];
            }[];
          }[];
        }[];
      };
      const specs = report.suites.flatMap((suite) => suite.specs);
      expect(specs.map(({ title }) => title)).toEqual(['pass', 'fail', 'timeout']);
      for (const spec of specs) {
        const results = spec.tests[0]!.results;
        expect(results).toHaveLength(1);
        expect(results[0]!.retry).toBe(0);
        expect(results[0]!.status).toBe(
          spec.title === 'pass' ? 'passed' : spec.title === 'fail' ? 'failed' : 'timedOut',
        );
        const trace = results[0]!.attachments.find(({ name }) => name === 'trace');
        if (spec.title === 'pass') {
          expect(trace).toBeUndefined();
          continue;
        }
        expect(trace?.path).toBeDefined();
        const files = unzipSync(readFileSync(trace!.path!));
        expect(Object.keys(files).some((file) => file.endsWith('.trace'))).toBe(true);
        expect(Object.keys(files).some((file) => file.startsWith('resources/'))).toBe(false);
        const events = Object.values(files)
          .map((bytes) => strFromU8(bytes))
          .join('\n');
        expect(events).not.toContain('SYNTHETIC_ATTACHMENT_MARKER');
        expect(events).toContain(spec.title === 'fail' ? 'failed step' : 'Timeout');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 40_000);
});
