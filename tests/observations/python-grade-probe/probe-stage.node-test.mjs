import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { markOnSpawn, readStages, writeStage } from './probe-stage.mjs';

test('only allowed markers with exact contents become reached, all missing or malformed remain unknown', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'probe-stage-'));
  try {
    assert.equal(await writeStage(dir, 'runner-enter'), true);
    assert.equal(await writeStage(dir, 'runner-enter'), false);
    assert.equal(await writeStage(dir, '../other'), false);
    writeFileSync(join(dir, 'stage-bridge-ready'), 'SECRET_UNTRUSTED');
    symlinkSync('/etc/hosts', join(dir, 'stage-spec-started'));
    const result = readStages(dir);
    assert.equal(result['runner-enter'], 'reached');
    for (const key of ['bridge-ready', 'spec-started', 'grade-accepted'])
      assert.equal(result[key], 'unknown');
    const cli = fileURLToPath(new URL('./probe-stage.mjs', import.meta.url));
    const out = spawnSync(process.execPath, [cli, dir], { encoding: 'utf8' });
    assert.equal(out.status, 0);
    assert.doesNotMatch(out.stdout + out.stderr, /SECRET|UNTRUSTED|localhost/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('spawned is marked only after a successful child spawn event', async () => {
  const observe = (command, args) =>
    new Promise((resolve) => {
      const child = spawn(command, args, { stdio: 'ignore' });
      const seen = [];
      markOnSpawn(child, (stage) => seen.push(stage));
      child.on('error', () => {});
      child.once('close', () => resolve(seen));
    });
  assert.deepEqual(await observe(process.execPath, ['-e', '']), ['playwright-spawned']);
  const dir = mkdtempSync(join(tmpdir(), 'probe-missing-'));
  try {
    assert.deepEqual(await observe(join(dir, 'no-such-executable'), []), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
