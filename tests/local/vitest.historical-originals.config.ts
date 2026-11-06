import { defineConfig } from 'vitest/config';
import base from '../../vitest.config.ts';

/** 私有原本の明示検査だけを収集する。原本不在はskipではなく失敗にする。 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/local/python-practice-historical-originals.test.ts'],
    exclude: [],
  },
});
