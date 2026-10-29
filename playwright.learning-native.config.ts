import { defineConfig, devices } from '@playwright/test';
/** Existing dedicated Native web/preview bridges; actual browser engines, one worker, no retries. */
export default defineConfig({
  testDir: './tests/local',
  testMatch: ['manifest-next-learning.spec.ts'],
  workers: 1,
  retries: 0,
  timeout: 180000,
  outputDir: 'test-results/native-learning',
  use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
