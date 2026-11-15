import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'probe.spec.ts',
  outputDir: '/tmp/python-grade-probe-results',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['line']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'off',
    trace: 'off',
  },
});
