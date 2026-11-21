const { URL, process, Buffer } = globalThis;
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('./startup-diagnostic.mjs', import.meta.url));
const invoke = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 5000 });

test('CLI emits only the fixed classification and never log content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'issue143-startup-'));
  try {
    const log = join(dir, 'private.log');
    await writeFile(log, 'PRIVATE_MARKER https://example.invalid/SECRET\nERR_REQUIRE_ASYNC_MODULE\n');
    const result = invoke(log);
    assert.equal(result.status, 0); assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'startup-diagnostic pattern-seen-async-require\n');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI rejects missing, oversized, directory, symlink and extra arguments safely', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'issue143-startup-'));
  try {
    const log = join(dir, 'private.log'), large = join(dir, 'large'), link = join(dir, 'link');
    await writeFile(log, 'PRIVATE_MARKER'); await writeFile(large, Buffer.alloc(1048577)); await symlink(log, link);
    for (const args of [[], [join(dir, 'missing')], [large], [dir], [link], [log, 'PRIVATE_MARKER']]) {
      const result = invoke(...args);
      assert.equal(result.status, 0); assert.equal(result.stderr, '');
      assert.equal(result.stdout, 'startup-diagnostic unavailable\n');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI fails closed on changed source without exposing source or log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'issue143-mismatch-'));
  try {
    const copied = join(await realpath(dir), 'startup-diagnostic.mjs'), log = join(dir, 'private.log');
    await copyFile(cli, copied);
    await copyFile(new URL('./local-import.pw-spec.ts', import.meta.url), join(dir, 'local-import.pw-spec.ts'));
    await writeFile(join(dir, 'preview-diagnostic.mjs'), 'PRIVATE_MARKER');
    await writeFile(log, 'ERR_REQUIRE_ASYNC_MODULE PRIVATE_MARKER');
    const result = spawnSync(process.execPath, [copied, log], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0); assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'startup-diagnostic source-mismatch\n');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
