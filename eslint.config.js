/** project tsconfigを前提に、JS／TypeScript／React用Lint設定を副作用なくexportする。 */
import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'public/generated/content',
      'content/**/*.js',
      'playwright-report',
      'playwright-performance-report',
      'test-results',
      '.worktrees',
    ],
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    extends: [eslint.configs.recommended, tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      // Schema検証後のindexed accessと非同期Adapter interfaceを明示的に許可する。
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
