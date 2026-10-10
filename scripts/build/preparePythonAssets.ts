/** 固定coreと通知を照合し、Python演習用の自己配信assetだけを生成する。 */
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import {
  PYTHON_VENDOR_ROOT,
  PYTHON_OUTPUT_ROOT,
  PythonDistributionManifestSchema,
  PYTHON_PREFERRED_SOURCE_FILES,
  pythonSourceOfferText,
  pythonNoticesHtml,
} from './pythonDistribution';

const vendorRoot = PYTHON_VENDOR_ROOT;
const outputRoot = `public/${PYTHON_OUTPUT_ROOT}`;
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

await access('/.dockerenv');
const manifest = PythonDistributionManifestSchema.parse(
  JSON.parse(await readFile(`${vendorRoot}/manifest.json`, 'utf8')),
);
if (new Set(manifest.map(({ file }) => file)).size !== manifest.length)
  throw new Error('Python配布manifestに重複があります');
for (const entry of manifest) {
  const bytes = await readFile(path.join(vendorRoot, entry.file));
  if (bytes.byteLength !== entry.bytes || hash(bytes) !== entry.sha256)
    throw new Error(`Python配布入力の照合に失敗しました: ${entry.file}`);
}
await mkdir(`${outputRoot}/licenses`, { recursive: true });
for (const entry of manifest.filter(({ file }) => file.startsWith('licenses/')))
  await copyFile(path.join(vendorRoot, entry.file), path.join(outputRoot, entry.file));
await build({
  stdin: {
    contents: `
      import { initializePythonWorker } from './src/adapters/runtime/python/pythonWorker.ts';
      import { loadPyodide } from './${vendorRoot}/pyodide.mjs';
      import createModule from './${vendorRoot}/pyodide.asm.mjs';
      initializePythonWorker(loadPyodide, createModule);
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile: `${outputRoot}/worker.js`,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  banner: {
    js: '"use strict";\n/* Pyodide/hiwire: MPL 2.0。通知と対象ソース案内: SOURCES.txt、licenses/ */',
  },
  define: { 'import.meta.url': JSON.stringify('https://python.invalid/pyodide.mjs') },
  target: 'es2022',
  external: ['node:*', 'fs', 'path', 'url', 'crypto', 'ws'],
});
for (const [source, destination] of [
  ['pyodide.asm.wasm', 'core.wasm'],
  ['python_stdlib.zip', 'stdlib.zip'],
  ['pyodide-lock.json', 'lock.json'],
] as const)
  await copyFile(path.join(vendorRoot, source), path.join(outputRoot, destination));
await writeFile(
  `${outputRoot}/worker.json`,
  JSON.stringify({ sha256: hash(await readFile(`${outputRoot}/worker.js`)) }) + '\n',
);
for (const source of PYTHON_PREFERRED_SOURCE_FILES) {
  const destination = path.join(outputRoot, 'sources', source);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
await writeFile(`${outputRoot}/SOURCES.txt`, pythonSourceOfferText());
await writeFile(`${outputRoot}/NOTICES.html`, pythonNoticesHtml(manifest.map(({ file }) => file)));
console.log('Python固定assetとlicense/source案内を生成しました');
