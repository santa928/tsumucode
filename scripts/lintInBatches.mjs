import { ESLint } from 'eslint';
import console from 'node:console';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const engine = new ESLint();
const files = [];
async function collect(directory = '.') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // ESLint's default traversal exclusions. The unchanged config decides every source file.
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(?:js|cjs|mjs|ts|tsx)$/u.test(entry.name)) {
      if (await engine.isPathIgnored(file)) continue;
      // Never silently omit an unexpected linked source from the required check.
      if (!entry.isFile()) throw Error('Lint source must be a regular file: ' + file);
      files.push(file);
    }
  }
}
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--list'))
  throw Error('Usage: node scripts/lintInBatches.mjs [--list]');
await collect();
files.sort();
if (!files.length) throw Error('No lintable source files selected');
if (args[0] === '--list') console.log(JSON.stringify(files));
else {
  const binary = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
  const size = 64,
    total = Math.ceil(files.length / size);
  for (let offset = 0; offset < files.length; offset += size) {
    console.log('Lint batch ' + String(offset / size + 1) + '/' + String(total));
    const result = spawnSync(
      process.execPath,
      [binary, '--no-warn-ignored', '--', ...files.slice(offset, offset + size)],
      { stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
  if (!process.exitCode) console.log('Lint passed: ' + String(files.length) + ' files');
}
