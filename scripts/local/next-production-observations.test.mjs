import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const fixture = fileURLToPath(
  new URL('./fixtures/next-production-response-timing.mjs', import.meta.url),
);

for (const surface of ['link', 'filter']) {
  for (const timing of ['response-first', 'focus-first', 'response-after', 'normal']) {
    test(`${surface}: ${timing}でも元の成否を返し、未処理拒否で採点器を終了させない`, () => {
      const child = spawnSync(
        process.execPath,
        ['--unhandled-rejections=strict', fixture, surface, timing],
        { encoding: 'utf8', timeout: 3000, maxBuffer: 16 * 1024 },
      );
      assert.equal(child.status, 0, child.stderr.slice(0, 2000));
      const expected =
        timing === 'normal'
          ? { kind: 'returned', checks: 3 }
          : {
              kind: 'thrown',
              name: timing === 'focus-first' ? 'Error' : 'NextLessonObservationError',
            };
      assert.deepEqual(JSON.parse(child.stdout), expected);
    });
  }
}
