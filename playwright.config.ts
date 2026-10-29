import { defineConfig, devices } from '@playwright/test';
import { testServerUrl } from './tests/e2e/helpers/testBasePath';

const CROSS_BROWSER_SMOKE_SPECS = [
  'manifest-learning.spec.ts',
  'initial-preview.spec.ts',
  'exercise-reset.spec.ts',
  'editor-input-support.spec.ts',
  'runtime-security.spec.ts',
  'browser-console-runtime.spec.ts',
  'browser-dom-runtime.spec.ts',
  'typescript-release-smoke.spec.ts',
  'python-release-smoke.spec.ts',
  'python-input.spec.ts',
  'tailwind.spec.ts',
  'tailwind-foundations.spec.ts',
  'tailwind-project.spec.ts',
] as const;

/** 任意のGitHub Pages subpathへpreviewとVite serverを揃えた実ブラウザ設定を作る。 */
export function createPlaywrightConfig(
  basePath = process.env['BASE_PATH'],
  projection: 'public' | 'authoring' = process.env['TSUMUCODE_AUTHORING_PREVIEW'] === '1'
    ? 'authoring'
    : 'public',
) {
  const authoring = projection === 'authoring';
  return defineConfig({
    testDir: './tests/e2e',
    outputDir: 'test-results/e2e-artifacts',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    workers: process.env.CI ? 1 : 2,
    retries: process.env.CI ? 2 : 0,
    reporter: [
      ['list'],
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
        command:
          'npm run preview -- --host 0.0.0.0 --port 4173 --strictPort' +
          (authoring ? ' --outDir .release-v2/authoring-dist' : ''),
        url: testServerUrl(4173, basePath),
        reuseExistingServer: false,
      },
      {
        command: 'npm exec vite -- --host 0.0.0.0 --port 4174 --strictPort',
        env: { TSUMUCODE_AUTHORING_PREVIEW: authoring ? '1' : '0' },
        url: testServerUrl(4174, basePath),
        reuseExistingServer: false,
      },
    ],
    projects: [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      {
        name: 'firefox',
        testMatch: [...CROSS_BROWSER_SMOKE_SPECS],
        use: { ...devices['Desktop Firefox'] },
      },
      {
        name: 'webkit',
        testMatch: [...CROSS_BROWSER_SMOKE_SPECS],
        use: { ...devices['Desktop Safari'] },
      },
    ],
  });
}

export default createPlaywrightConfig();
