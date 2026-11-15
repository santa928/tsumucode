const { URL, process } = globalThis;
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const target = fileURLToPath(new URL('./preview-diagnostic.mjs', import.meta.url));
const run = source => spawnSync(process.execPath, ['-e', source], { encoding: 'utf8', timeout: 5000 });

test('synchronous require loads preview diagnostics without CLI side effects', () => {
  const result = run(`const m = require(${JSON.stringify(target)}); if (typeof m.createPreviewTracker !== 'function') process.exit(2); console.log('loaded');`);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'loaded\n');
  assert.equal(result.stderr, '');
});

test('dynamic import loads preview diagnostics without CLI side effects', () => {
  const result = run(`import(${JSON.stringify(pathToFileURL(target).href)}).then(m => { if (typeof m.createPreviewTracker !== 'function') process.exit(2); console.log('loaded'); }, () => process.exit(3));`);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'loaded\n');
  assert.equal(result.stderr, '');
});

test('synchronous require rejects a module with top-level await', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'issue143-require-'));
  try {
    const fixture = join(dir, 'async.mjs');
    await writeFile(fixture, 'await Promise.resolve(); export const value = 1;\n');
    const result = run(`require(${JSON.stringify(fixture)})`);
    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes('ERR_REQUIRE_ASYNC_MODULE'), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
