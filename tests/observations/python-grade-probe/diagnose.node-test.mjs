import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { classify } from './diagnose.mjs';

test('only finite clues derived from synthetic text are returned', () => {
  assert.deepEqual(classify('SECRET: Error [ERR_MODULE_NOT_FOUND]', 'PRIVATE EACCES'), {
    docker: 'available',
    browser: 'available',
    patterns: ['module-resolution-pattern', 'permission-pattern'],
  });
  assert.deepEqual(classify(null, 'ordinary text'), {
    docker: 'unknown',
    browser: 'available',
    patterns: [],
  });
  assert.deepEqual(
    classify("Executable doesn't exist; No tests found; ECONNREFUSED; TimeoutError", null).patterns,
    [
      'browser-executable-pattern',
      'no-tests-pattern',
      'connection-refused-pattern',
      'timeout-pattern',
    ],
  );
});
test('CLI emits no raw secret and treats missing, symlink and oversized files as unknown', () => {
  const dir = mkdtempSync(join(tmpdir(), 'probe-log-clues-'));
  try {
    const cli = fileURLToPath(new URL('./diagnose.mjs', import.meta.url));
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    writeFileSync(a, 'SECRET_CODE ERR_MODULE_NOT_FOUND');
    writeFileSync(b, 'PRIVATE EACCES');
    const run = () => spawnSync(process.execPath, [cli, a, b], { encoding: 'utf8' });
    let result = run();
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /SECRET|PRIVATE/u);
    assert.match(result.stdout, /module-resolution-pattern/u);
    writeFileSync(a, Buffer.alloc(65537));
    rmSync(b);
    symlinkSync('/etc/hosts', b);
    result = run();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /"docker":"unknown","browser":"unknown"/u);
    assert.doesNotMatch(result.stdout + result.stderr, /localhost|SECRET/u);
    rmSync(a);
    rmSync(b);
    assert.match(run().stdout, /"docker":"unknown","browser":"unknown"/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
