import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

test('success and failure print only fixed outcomes; raw child errors stay private', () => {
  const dir = mkdtempSync(join(tmpdir(), 'private-command-'));
  try {
    const script = fileURLToPath(new URL('./private-command.mjs', import.meta.url));
    for (const [name, code, expected] of [
      ['ok', 'console.log("SECRET_RUN_ID")', 0],
      ['fail', 'throw new Error("SECRET_CODE_EXCEPTION")', 1],
    ]) {
      const path = join(dir, name);
      const result = spawnSync(process.execPath, [script, path, process.execPath, '-e', code], {
        encoding: 'utf8',
      });
      assert.equal(result.status, expected);
      assert.doesNotMatch(result.stdout + result.stderr, /SECRET|RUN_ID|EXCEPTION/u);
      assert.match(result.stdout, expected ? /Private command failed/u : /Private command passed/u);
      assert.match(readFileSync(path, 'utf8'), /SECRET/u);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
