// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
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

it('propagates selection/configuration errors before running a lint batch', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'eslint.config.mjs'), 'export default [;\n');
  const result = spawnSync(process.execPath, [cli], { cwd: root, encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('SyntaxError');
  expect(result.stdout).not.toContain('Lint batch');
  expect(result.stdout).not.toContain('Lint passed');
}, 30000);

it('checks every file once without sharing a process between the app and Node leaf Programs', async () => {
  const root = await fixture();
  await writeFile(
    path.join(root, 'eslint.config.mjs'),
    `import {appendFileSync} from 'node:fs';
import path from 'node:path';
const programs = new Set();
const leafRule = {
  meta:{schema:[],messages:{mixed:'Different leaf Programs share one process'}},
  create(context){return {Program(node){
    const file=path.relative(process.cwd(),context.filename);
    programs.add(file.startsWith('src'+path.sep)?'app':'node');
    appendFileSync('visited.jsonl',JSON.stringify({file,pid:process.pid})+'\\n');
    if(programs.size>1)context.report({node,messageId:'mixed'});
  }}}
};
export default [{ignores:['eslint.config.mjs']},{files:['**/*.ts'],plugins:{boundary:{rules:{leaf:leafRule}}},rules:{'boundary/leaf':'error'}}];\n`,
  );
  for (const file of ['scripts/tool.ts', 'src/main.ts']) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'export const sample=1;\n');
  }
  const result = spawnSync(process.execPath, [cli], { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const visits = (await readFile(path.join(root, 'visited.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { file: string; pid: number });
  expect(visits.map(({ file }) => file).sort()).toEqual([
    path.join('scripts', 'tool.ts'),
    path.join('src', 'main.ts'),
  ]);
  expect(new Set(visits.map(({ pid }) => pid)).size).toBe(2);
}, 30000);
