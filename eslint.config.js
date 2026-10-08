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
      // Next原稿は固定Nextの実compileと正負Fixtureで検証する。
      'content/next/chapters/next-ch01/lessons/next-ch01-l01/exercises/**/*.{ts,tsx}',
      'content/next/chapters/next-ch02/lessons/*/exercises/**/*.{ts,tsx}',
      'content/next/chapters/next-ch03/lessons/*/exercises/**/*.{ts,tsx}',
      '.release-*',
      // 誤型を含むReact原稿は実TSX Compiler・Fixture検証へ渡す。
      'content/react/chapters/react-ch01/lessons/react-ch01-l01/exercises/**/*.tsx',
      'content/react/chapters/react-ch01/lessons/react-ch01-l02/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l03/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l04/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l05/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l06/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l07/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l08/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l09/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l10/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l11/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch01/lessons/react-ch01-l12/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch02/lessons/react-ch02-l01/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch02/lessons/react-ch02-l02/exercises/**/*.{ts,tsx}',
      'content/react/chapters/react-ch03/lessons/react-ch03-l01/exercises/**/*.{ts,tsx}',
      // 型誤り・any・抑制指示を含む教材は専用Compilerと製品採点で検証する。
      'docs/quality/typescript-ch01-l02-draft/exercises/**/*.ts',
      'docs/quality/typescript-ch01-l01-draft/exercises/**/*.ts',
      'docs/quality/typescript-ch01-l03-draft/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch01/lessons/*/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch02/lessons/typescript-ch02-l01/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch03/lessons/typescript-ch03-l01/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch03/lessons/typescript-ch03-l02/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch04/lessons/typescript-ch04-l01/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch04/lessons/typescript-ch04-l02/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch04/lessons/typescript-ch04-l03/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch05/lessons/typescript-ch05-l01/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch05/lessons/typescript-ch05-l02/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch05/lessons/typescript-ch05-l03/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch06/lessons/typescript-ch06-l01/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch06/lessons/typescript-ch06-l02/exercises/**/*.ts',
      'content/typescript/chapters/typescript-ch06/lessons/typescript-ch06-l03/exercises/**/*.ts',
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
