import { defineConfig, devices } from '@playwright/test';
import { testServerUrl } from './tests/e2e/helpers/testBasePath';

/** 同一production distを1 workerで測る性能専用Playwright設定。 */
export default defineConfig({
  testDir: './tests/performance',
  testMatch: ['preview-validation.spec.ts', 'interactions.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [
    ['html', { outputFolder: 'playwright-performance-report', open: 'never' }],
    ['json', { outputFile: 'test-results/performance.json' }],
  ],
  use: {
    baseURL: testServerUrl(),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 0.0.0.0 --port 4173',
    url: testServerUrl(),
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
