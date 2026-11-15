// @vitest-environment node
// Node子processの終了を検査し、FixtureのURLを実ファイルとして解決する。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'vitest';
import * as observation from './next-production-observations.mjs';

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

for (const stage of ['select', 'submit', 'response', 'verify', 'invalid', 'recovery']) {
  test(`filter ${stage} の例外時は固定段階だけを残し、例外本文を出さない`, () => {
    const child = spawnSync(process.execPath, [fixture, 'filter', 'normal', stage], {
      encoding: 'utf8',
      timeout: 3000,
      maxBuffer: 16 * 1024,
    });
    assert.equal(child.status, 0);
    const result = JSON.parse(child.stdout);
    assert.equal(result.kind, 'thrown');
    assert.equal(result.name, 'TypeError');
    assert.equal(result.steps.at(-1), `project-filter-${stage}`);
    assert.doesNotMatch(child.stdout + child.stderr, /private fixture marker/u);
  });
}

test('例外型は固定語彙のみで、非Errorやgetterを含む値をそのまま出さない', () => {
  assert.equal(typeof observation.projectGradeErrorKind, 'function');
  assert.equal(observation.projectGradeErrorKind(new TypeError('private')), 'type-error');
  assert.equal(observation.projectGradeErrorKind(new RangeError('private')), 'range-error');
  assert.equal(observation.projectGradeErrorKind(new SyntaxError('private')), 'syntax-error');
  assert.equal(observation.projectGradeErrorKind(new Error('private')), 'error');
  const unusual = new TypeError('private');
  Object.defineProperty(unusual, 'name', {
    get() {
      throw Error('private getter');
    },
  });
  assert.equal(observation.projectGradeErrorKind(unusual), 'type-error');
  const hostile = new Proxy(
    {},
    {
      get() {
        throw Error('private getter');
      },
    },
  );
  assert.equal(observation.projectGradeErrorKind(hostile), 'non-error');
});
