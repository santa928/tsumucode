import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import practiceReadingConfig from './python-practice.config';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** OOP草稿の統合読書だけを選び、通常の演習検査や実践Courseと分ける。 */
export default defineConfig({
  ...practiceReadingConfig,
  testMatch: 'python-oop-reading.spec.ts',
  outputDir: path.join(repositoryRoot, 'test-results/python-oop-acceptance'),
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: path.join(repositoryRoot, 'test-results/python-oop-acceptance-summary.json') },
    ],
  ],
});
