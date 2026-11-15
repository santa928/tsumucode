import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateLog } from './private-log.mjs';

test('raw data is limited to a private file; a symlink or second file creation is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'private-grade-log-'));
  try {
    const path = join(dir, 'log');
    const log = createPrivateLog(path);
    log.write(Buffer.from('SECRET_RUN_ID_SOURCE_EXCEPTION'));
    log.write(Buffer.alloc(100000, 97));
    log.close();
    assert.equal(readFileSync(path).length, 65536);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.throws(() => createPrivateLog(path));
    const link = join(dir, 'link');
    symlinkSync(path, link);
    assert.throws(() => createPrivateLog(link));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
