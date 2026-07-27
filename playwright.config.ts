import { defineConfig, devices } from '@playwright/test';
import { testServerUrl } from './tests/e2e/helpers/testBasePath';

/** 任意のGitHub Pages subpathへpreviewとVite serverを揃えた実ブラウザ設定を作る。 */
export function createPlaywrightConfig(basePath = process.env['BASE_PATH']) {
  return defineConfig({
    testDir: './tests/e2e',
    outputDir: 'test-results/e2e-artifacts',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    workers: process.env.CI ? 1 : 2,
    retries: process.env.CI ? 2 : 0,
    reporter: [
      ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ['json', { outputFile: 'test-results/e2e-summary.json' }],
    ],
    use: {
      baseURL: testServerUrl(4173, basePath),
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
    },
    webServer: [
      {
        command: 'npm run preview -- --host 0.0.0.0 --port 4173 --strictPort',
        url: testServerUrl(4173, basePath),
        reuseExistingServer: false,
      },
      {
        command: 'npm exec vite -- --host 0.0.0.0 --port 4174 --strictPort',
        url: testServerUrl(4174, basePath),
        reuseExistingServer: false,
      },
    ],
    projects: [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
  });
}

export default createPlaywrightConfig();
