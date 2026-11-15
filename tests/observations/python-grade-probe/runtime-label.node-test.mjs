import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterGradeLabel, beforeGradeLabel } from './runtime-label.mjs';

test('local engine is required before grade and the fixed version remains required afterwards', () => {
  assert.equal(beforeGradeLabel('ローカル CPythonで実行'), true);
  assert.equal(beforeGradeLabel('ローカル CPython 3.14.2で実行'), true);
  assert.equal(afterGradeLabel('ローカル CPythonで実行'), false);
  assert.equal(afterGradeLabel('ローカル CPython 3.14.2で実行'), true);
  for (const invalid of [
    null,
    '',
    'ブラウザで実行',
    'ローカル CPython 3.14.3で実行',
    'ローカル Node.jsで実行',
    'ローカル CPython 3.14.2で実行 extra',
  ]) {
    assert.equal(beforeGradeLabel(invalid), false);
    assert.equal(afterGradeLabel(invalid), false);
  }
});
