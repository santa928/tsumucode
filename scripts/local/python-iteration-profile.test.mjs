import assert from 'node:assert/strict';
import { test } from 'vitest';
import { validateRun, PYTHON_PROFILE_ID } from './protocol.mjs';

const input = {
  apiVersion: 1,
  exerciseId: 'python-practice-ch01-l01-e01',
  contentRevision: 'practice-r1',
  runtimeProfileId: PYTHON_PROFILE_ID,
  runId: 'iteration-run',
  exerciseSessionId: 'iteration-session',
  executionRevision: 1,
  files: { 'main.py': 'print([])\n' },
};

test('独立Courseは自身のrevisionを要求し、基礎のrevisionで代用しない', () => {
  assert.equal(validateRun(input, 'js-r1', 'basics-r1', 'practice-r1'), input);
  assert.throws(
    () =>
      validateRun({ ...input, contentRevision: 'basics-r1' }, 'js-r1', 'basics-r1', 'practice-r1'),
    { status: 409 },
  );
  assert.throws(() => validateRun(input, 'js-r1', 'basics-r1'), { status: 409 });
  assert.throws(() => validateRun({ ...input, contentRevision: undefined }, 'js-r1', 'basics-r1'), {
    status: 409,
  });
});

test('要求からCourse・profile・fileを増やさず、固定演習IDだけを受け入れる', () => {
  assert.throws(
    () => validateRun({ ...input, courseId: 'python-basics' }, 'js-r1', 'basics-r1', 'practice-r1'),
    { status: 400 },
  );
  assert.throws(
    () =>
      validateRun(
        { ...input, exerciseId: 'python-practice-arbitrary', contentRevision: 'basics-r1' },
        'js-r1',
        'basics-r1',
        'practice-r1',
      ),
    { status: 422 },
  );
  assert.throws(
    () =>
      validateRun(
        { ...input, files: { ...input.files, 'helper.py': '' } },
        'js-r1',
        'basics-r1',
        'practice-r1',
      ),
    { status: 400 },
  );
});
