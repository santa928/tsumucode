import { fileURLToPath } from 'node:url';
import { testServerUrl } from '../e2e/helpers/testBasePath';
import { defineConfig, devices } from '@playwright/test';
import { createPlaywrightConfig } from '../../playwright.config';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** 公開受入の追加検証を通常の変更関連Browser試験から分ける。 */
export default defineConfig({
  ...createPlaywrightConfig(),
  testDir: '.',
  outputDir: `${repositoryRoot}/test-results/react-acceptance-artifacts`,
  reporter: [
    ['json', { outputFile: `${repositoryRoot}/test-results/react-acceptance-summary.json` }],
  ],
  webServer: [
    {
      command: 'npm run preview -- --host 0.0.0.0 --port 4173 --strictPort',
      url: testServerUrl(4173),
      cwd: repositoryRoot,
      reuseExistingServer: false,
    },
    {
      command: 'npm exec vite -- --host 0.0.0.0 --port 4174 --strictPort',
      url: testServerUrl(4174),
      cwd: repositoryRoot,
      reuseExistingServer: false,
    },
  ],
  testMatch: '*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
