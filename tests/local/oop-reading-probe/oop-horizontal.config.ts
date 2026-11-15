import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { testServerUrl } from '../../e2e/helpers/testBasePath';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
export default defineConfig({
  testDir: '.',
  testMatch: 'oop-horizontal.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: path.join(repositoryRoot, 'test-results/oop-horizontal-probe'),
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(repositoryRoot, 'test-results/oop-horizontal-summary.json') }],
  ],
  use: { ...devices['Desktop Chrome'], baseURL: testServerUrl(4173), trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: testServerUrl(4173),
    cwd: repositoryRoot,
    reuseExistingServer: false,
  },
});
