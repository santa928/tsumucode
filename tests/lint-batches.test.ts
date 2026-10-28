// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { ESLint } from 'eslint';
const roots: string[] = [];
const cli = path.resolve('scripts/lintInBatches.mjs');
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lint-batch-contract-'));
  roots.push(root);
  await writeFile(
    path.join(root, 'eslint.config.mjs'),
    "export default [{ignores:['ignored/**']},{files:['**/*.{js,cjs,mjs,ts,tsx}'],rules:{'no-undef':'error'}}];\n",
  );
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
it('selects the same complete file set as ESLint including hidden and untracked source', async () => {
  const root = await fixture();
  for (const file of [
    'src/main.ts',
    'scripts/helper.mjs',
    'tests/case.tsx',
    '.hidden.js',
    'new-untracked.ts',
    'ignored/skip.js',
    'node_modules/skip.js',
    '.git/skip.js',
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'export const sample=1;\n');
  }
  const expected = (await new ESLint({ cwd: root }).lintFiles(['.']))
    .map((row) => path.relative(root, row.filePath))
    .sort();
  const result = spawnSync(process.execPath, [cli, '--list'], { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout) as unknown).toEqual(expected);
  expect(expected).toContain('.hidden.js');
  expect(expected).toContain('new-untracked.ts');
  expect(expected).not.toContain('ignored/skip.js');
}, 30000);
it('propagates a real lint failure and never runs later batches or prints success', async () => {
  const root = await fixture();
  for (let index = 0; index < 65; index++)
    await writeFile(
      path.join(root, 'a' + String(index).padStart(3, '0') + '.js'),
      index === 0 ? 'undeclaredName();\n' : 'export const sample=1;\n',
    );
  const result = spawnSync(process.execPath, [cli], { cwd: root, encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain('no-undef');
  expect(result.stdout).toContain('Lint batch 1/2');
  expect(result.stdout).not.toContain('Lint batch 2/2');
  expect(result.stdout).not.toContain('Lint passed');
}, 30000);
