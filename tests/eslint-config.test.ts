/** main checkout直下のlinked worktreeをESLintの再帰探索へ含めない契約を検証する。 */
import path from 'node:path';
import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

test('repository-local linked worktreeをroot lintの対象外にする', async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const nestedWorktreeFile = path.join(process.cwd(), '.worktrees', 'example', 'src', 'fixture.ts');

  await expect(eslint.isPathIgnored(nestedWorktreeFile)).resolves.toBe(true);
});
