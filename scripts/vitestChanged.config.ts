/** 変更関連の検証にだけ、同一の既定設定とCompiler優先の開始順を使う。 */
import { defineConfig } from 'vitest/config';
import base from '../vitest.config.ts';
import CompilerFirstTestSequencer from './compilerFirstTestSequencer.ts';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    sequence: { ...base.test?.sequence, sequencer: CompilerFirstTestSequencer },
  },
});
