import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { BuildIdentitySchema } from './scripts/release/v2/schema';
/** The production caller uses the candidate's fixed Pages origin. Local probes cannot pass receipt verification. */
export function createPublishedPlaywrightConfig(probeBaseURL?: string) {
  const candidate = BuildIdentitySchema.parse(
    JSON.parse(readFileSync('.release-v2/candidate.json', 'utf8')) as unknown,
  );
  const baseURL =
    probeBaseURL ??
    'https://' + candidate.repository.split('/')[0]! + '.github.io' + candidate.recipe.basePath;
  return defineConfig({
    testDir: './tests/e2e/published-operations',
    workers: 1,
    fullyParallel: false,
    retries: 0,
    maxFailures: 1,
    forbidOnly: true,
    timeout: 120000,
    outputDir: '.release-v2/public-operation-browser',
    reporter: 'json',
    use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  });
}
export default createPublishedPlaywrightConfig();
