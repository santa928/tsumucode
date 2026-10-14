import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import readingConfig from './python-practice.config';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** 受入指摘で変わる2Courseの読書・再開だけを選び、通常全Course検査へ混入させない。 */
export default defineConfig({
  ...readingConfig,
  testMatch: [
    'python-practice-reading.spec.ts',
    'python-oop-reading.spec.ts',
    'python-resume.spec.ts',
  ],
  outputDir: `${repositoryRoot}/test-results/python-feedback`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${repositoryRoot}/test-results/python-feedback-summary.json` }],
  ],
});
