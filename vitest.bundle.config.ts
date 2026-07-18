import { defineConfig } from 'vitest/config';

/** Production distへ依存する配信量GateだけをBuild後に独立実行する。 */
export default defineConfig({
  test: {
    include: ['tests/performance/bundle-budget.test.ts'],
    environment: 'node',
  },
});
