import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { testServerUrl } from '../e2e/helpers/testBasePath';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** 草稿Courseの読書と配信境界だけを、通常の全Course検査から分けて確認する。 */
export default defineConfig({
  testDir: '.',
  testMatch: 'python-practice-reading.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  outputDir: `${repositoryRoot}/test-results/python-practice-acceptance`,
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: `${repositoryRoot}/test-results/python-practice-acceptance-summary.json` },
    ],
  ],
  use: {
    baseURL: testServerUrl(4173),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 0.0.0.0 --port 4173 --strictPort',
    url: testServerUrl(4173),
    cwd: repositoryRoot,
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
