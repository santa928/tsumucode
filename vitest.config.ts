/** jsdomと共通setupを前提に、React test／alias設定を副作用なくexportする。 */
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      '.worktrees/**',
      'tests/e2e/**',
      'tests/performance/**/*.spec.ts',
      'tests/performance/bundle-budget.test.ts',
    ],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
