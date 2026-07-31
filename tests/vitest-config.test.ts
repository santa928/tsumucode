/** main checkoutからVitestを起動してもlinked worktreeのsuiteを重複収集しない契約を検証する。 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const execFileAsync = promisify(execFile);

test('repository-local linked worktreeをroot test suiteの対象外にする', async () => {
  const vitestCli = path.resolve('node_modules/vitest/vitest.mjs');
  const { stdout } = await execFileAsync(process.execPath, [vitestCli, 'list', '--filesOnly'], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024,
  });

  expect(stdout).not.toMatch(/(?:^|\n)\.worktrees\//u);
});
