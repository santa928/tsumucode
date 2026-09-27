import { defineConfig, devices } from '@playwright/test';

/** 起動済みの専用Composeと実Nodeを使う。通常のPages E2Eとは別に明示実行する。 */
export default defineConfig({
  testDir: './tests/local',
  workers: 1,
  retries: 0,
  timeout: 60000,
  outputDir: 'test-results/local-node',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/local-node', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
