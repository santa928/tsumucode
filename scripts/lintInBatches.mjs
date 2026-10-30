import console from 'node:console';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--list'))
  throw Error('Usage: node scripts/lintInBatches.mjs [--list]');
if (args[0] === '--list') {
  // Release the configuration/parser heap before starting any typed lint process.
  const { ESLint } = await import('eslint');
  const engine = new ESLint(),
    files = [];
  async function collect(directory = '.') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (/\.(?:js|cjs|mjs|ts|tsx)$/u.test(entry.name)) {
        if (await engine.isPathIgnored(file)) continue;
        if (!entry.isFile()) throw Error('Lint source must be a regular file: ' + file);
        files.push(file);
      }
    }
  }
  await collect();
  files.sort();
  if (!files.length) throw Error('No lintable source files selected');
  console.log(JSON.stringify(files));
} else {
  const selection = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--list'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (selection.error) throw selection.error;
  if (selection.status !== 0) {
    process.stderr.write(selection.stderr);
    process.exitCode = selection.status ?? 1;
  } else {
    const files = JSON.parse(selection.stdout);
    if (!Array.isArray(files) || !files.length || files.some((file) => typeof file !== 'string'))
      throw Error('Invalid lint file selection');
    const binary = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
    // Match eslint.config.js's leaf split so one process never retains both typed Programs.
    const appFile = (file) => file.startsWith('src' + path.sep) && /\.tsx?$/u.test(file);
    const batches = [];
    for (const group of [files.filter((file) => !appFile(file)), files.filter(appFile)])
      for (let offset = 0; offset < group.length; offset += 64)
        batches.push(group.slice(offset, offset + 64));
    for (const [index, batch] of batches.entries()) {
      console.log('Lint batch ' + String(index + 1) + '/' + String(batches.length));
      const result = spawnSync(
        process.execPath,
        [binary, '--no-warn-ignored', '--', ...batch],
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
}
