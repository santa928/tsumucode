import { defineConfig, devices } from '@playwright/test';
import { testServerUrl } from '../e2e/helpers/testBasePath';

/** Verification-only preview; no qualification receipt is produced. */
export default defineConfig({
  testDir: '.',
  testMatch: 'publicOperationFaultProbe.spec.ts',
  outputDir: '/tmp/public-fault-probe-results',
  workers: 1,
  retries: 0,
  timeout: 120000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: testServerUrl(4173),
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: testServerUrl(4173),
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
