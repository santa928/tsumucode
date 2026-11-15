import { defineConfig, devices } from '@playwright/test';

const phase = process.env['OBSERVATION_PHASE'];
if (!phase || !['export', 'home', 'local'].includes(phase)) throw Error('Invalid observation phase');
const names: Record<string, string> = {
  export: 'pages-export.spec.ts', home: 'home-resume.spec.mjs', local: 'local-import.spec.ts',
};
const testMatch = names[phase];
if (!testMatch) throw Error('Invalid observation phase');
export default defineConfig({
  testDir: '.', testMatch, workers: 1, retries: 0, forbidOnly: true,
  timeout: 60_000,
  outputDir: `/exchange/${phase}-artifacts`,
  reporter: [['json', { outputFile: `/exchange/${phase}-report.json` }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: phase === 'local' ? 'http://127.0.0.1:4173/' : 'https://santa928.github.io/tsumucode/',
    trace: 'off', screenshot: 'off', video: 'off',
  },
  projects: [{ name: 'chromium' }],
});
