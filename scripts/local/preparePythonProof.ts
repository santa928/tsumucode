/** 承認済みPython coreを検証し、公開に接続しない作者用loopback artifactをDocker内で作る。 */
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build as bundleWorker } from 'esbuild';
import { build as buildApp } from 'vite';
import { compileCourse } from '../content/compileCourse';
import {
  buildSplitContentDelivery,
  writeSplitContentDeliveryTree,
} from '../content/splitContentDelivery';
import { inlineProductionCss } from '../inline-production-css';
import { CourseCatalogV3Schema } from '../../src/core/content/deliverySchema';

const proofRoot = '.release-issue138';
const coreRoot = `${proofRoot}/core/pyodide`;
const outputRoot = `${proofRoot}/local-dist`;
const coreFiles = [
  ['pyodide.mjs', 17_931, '6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109'],
  [
    'pyodide.asm.mjs',
    1_250_344,
    'f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635',
  ],
  [
    'pyodide.asm.wasm',
    9_598_218,
    'cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6',
  ],
  [
    'python_stdlib.zip',
    2_545_637,
    'fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a',
  ],
  [
    'pyodide-lock.json',
    119_077,
    '5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010',
  ],
] as const;

/** 正式配布物から展開したbytesのみをbundle入力として受け入れる。 */
async function verifyCore(): Promise<void> {
  for (const [file, bytes, sha256] of coreFiles) {
    const value = await readFile(path.join(coreRoot, file));
    if (value.length !== bytes || createHash('sha256').update(value).digest('hex') !== sha256)
      throw new Error(`Python固定coreの照合に失敗しました: ${file}`);
  }
}

await access('/.dockerenv');
await verifyCore();
const python = await compileCourse('docs/quality/python-course-draft');
process.env.VITE_PYTHON_LOCAL_PROOF = '1';
process.env.BASE_PATH = '/tsumucode/';
await buildApp({ build: { outDir: outputRoot } });
const catalogPath = `${outputRoot}/generated/content/catalog-v3.json`;
const existing = CourseCatalogV3Schema.parse(JSON.parse(await readFile(catalogPath, 'utf8')));
if (existing.courses.some((course) => course.id === python.runtime.id))
  throw new Error('作者用Python Courseを通常contentへ登録しないでください');
const delivery = buildSplitContentDelivery([python], []);
await writeSplitContentDeliveryTree(`${outputRoot}/generated/content`, delivery);
await writeFile(
  catalogPath,
  JSON.stringify(
    CourseCatalogV3Schema.parse({
      ...existing,
      courses: [...existing.courses, ...delivery.catalog.courses],
    }),
  ),
);

const assetRoot = `${outputRoot}/python-local`;
await mkdir(assetRoot, { recursive: true });
await bundleWorker({
  stdin: {
    contents: `
      import { initializePythonWorker } from './src/adapters/runtime/python/pythonWorker.ts';
      import { loadPyodide } from './${coreRoot}/pyodide.mjs';
      import createModule from './${coreRoot}/pyodide.asm.mjs';
      initializePythonWorker(loadPyodide, createModule);
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile: `${assetRoot}/worker.js`,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  banner: { js: '"use strict";' },
  define: { 'import.meta.url': JSON.stringify('https://python.invalid/pyodide.mjs') },
  target: 'es2022',
  external: ['node:*', 'fs', 'path', 'url', 'crypto', 'ws'],
});
for (const [source, destination] of [
  ['pyodide.asm.wasm', 'core.wasm'],
  ['python_stdlib.zip', 'stdlib.zip'],
  ['pyodide-lock.json', 'lock.json'],
])
  await copyFile(path.join(coreRoot, source!), path.join(assetRoot, destination!));
const sha256 = createHash('sha256')
  .update(await readFile(`${assetRoot}/worker.js`))
  .digest('hex');
await writeFile(`${assetRoot}/worker.json`, JSON.stringify({ sha256 }));
await inlineProductionCss({ distRoot: outputRoot });
console.log(`Python作者用artifact: ${outputRoot}（loopback専用・公開不可）`);
