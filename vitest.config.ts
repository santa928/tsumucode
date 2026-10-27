/** jsdomと共通setupを前提に、React test／alias設定を副作用なくexportする。 */
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const workerLimit = process.env['TSUMUCODE_TEST_MAX_WORKERS'];
if (workerLimit !== undefined && !/^[1-9]\d*$/u.test(workerLimit)) {
  throw new Error('TSUMUCODE_TEST_MAX_WORKERSは正の整数を指定してください。');
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    ...(workerLimit === undefined ? {} : { maxWorkers: Number(workerLimit) }),
    exclude: [
      ...configDefaults.exclude,
      '.worktrees/**',
      'tests/e2e/**',
      'tests/acceptance/**/*.spec.ts',
      'tests/local/**',
      'tests/performance/**/*.spec.ts',
      'tests/performance/bundle-budget.test.ts',
    ],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
