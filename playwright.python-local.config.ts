import { defineConfig, devices } from '@playwright/test';

/** 固定CPythonの通常画面を専用Docker環境で検証する。 */
export default defineConfig({
  testDir: './tests',
  testMatch: [
    '**/local/python-learning.spec.ts',
    '**/e2e/python-input.spec.ts',
    '**/e2e/python-module.spec.ts',
  ],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: 'test-results/local-python',
  reporter: [['list'], ['json', { outputFile: 'test-results/local-python/results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
