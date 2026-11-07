import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { testServerUrl } from '../e2e/helpers/testBasePath';
import { createPlaywrightConfig } from '../../playwright.config';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** 代表改訂を含む14演習の全Fixtureを3engineで照合する。通常CIの代表選択と分ける。 */
export default defineConfig({
  ...createPlaywrightConfig(),
  testDir: '../e2e',
  // 3specは固定production previewの通常UIだけを使い、開発serverを必要としない。
  webServer: [
    {
      command: 'npm run preview -- --host 0.0.0.0 --port 4173 --strictPort',
      url: testServerUrl(4173),
      cwd: repositoryRoot,
      reuseExistingServer: false,
    },
  ],
  testMatch: ['python-release-smoke.spec.ts', 'python-input.spec.ts', 'python-module.spec.ts'],
  outputDir: `${repositoryRoot}/test-results/python-basics-acceptance-artifacts`,
  reporter: [
    [
      'json',
      { outputFile: `${repositoryRoot}/test-results/python-basics-acceptance-summary.json` },
    ],
  ],
  workers: 1,
  retries: 0,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
