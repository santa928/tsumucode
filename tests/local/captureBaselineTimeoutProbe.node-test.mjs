import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(repoRoot, 'scripts/ci/captureBaselinePhase.mjs');
const vitest = path.join(repoRoot, 'node_modules/vitest/vitest.mjs');

function assertSyntheticTimeout(result, enabled) {
  assert.equal(result.status, 1, 'the synthetic failing test must exit with failure');
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  assert.ok(output.includes('Test timed out in 250ms'), 'synthetic timeout marker missing');
  assert.equal(
    output.includes('capture-baseline-phase copy start'),
    enabled,
    'synthetic phase marker mismatch',
  );
}

test('a missing marker does not expose captured child output', () => {
  const marker = 'private-fixture-payload';
  assert.throws(
    () => assertSyntheticTimeout({ status: 1, stdout: marker, stderr: '' }, true),
    (error) =>
      error.message === 'synthetic timeout marker missing' && !String(error.stack).includes(marker),
  );
});

test('a missing phase does not expose captured child output', () => {
  const marker = 'private-fixture-payload';
  assert.throws(
    () =>
      assertSyntheticTimeout(
        { status: 1, stdout: `Test timed out in 250ms ${marker}`, stderr: '' },
        true,
      ),
    (error) =>
      error.message.includes('synthetic phase marker mismatch') &&
      !String(error.stack).includes(marker),
  );
});

for (const enabled of [true, false]) {
  test(`synthetic Vitest timeout ${enabled ? 'keeps' : 'omits'} an enabled phase marker`, () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'capture-phase-probe-'));
    try {
      writeFileSync(
        path.join(temporary, 'vitest.config.mjs'),
        "export default { test: { globals: true, include: ['*.test.mjs'] } };\n",
      );
      writeFileSync(
        path.join(temporary, 'probe.test.mjs'),
        `import { markCaptureBaselinePhase } from ${JSON.stringify(helper)};\n` +
          `test('synthetic timeout', async () => { markCaptureBaselinePhase(${enabled}, 'copy', 'start'); await new Promise(() => {}); }, 250);\n`,
      );
      const result = spawnSync(
        process.execPath,
        [
          vitest,
          'run',
          '--root',
          temporary,
          '--config',
          path.join(temporary, 'vitest.config.mjs'),
          '--maxWorkers=1',
        ],
        { cwd: repoRoot, encoding: 'utf8', timeout: 20_000 },
      );
      assertSyntheticTimeout(result, enabled);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
}
