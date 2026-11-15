import test from 'node:test';
import assert from 'node:assert/strict';
import { hashesMatch, isExpectedList } from './loader-list-check.mjs';
const name = 'P6 new same-run synthetic Pages export imports into Local and runs the Python project';
const good = `Listing tests:\n  [chromium] › local-import.spec.ts:15:1 › ${name}\nTotal: 1 test in 1 file\n`;
test('requires successful collection of the unique expected test', () => {
  assert.equal(isExpectedList(0, good), true);
  for (const [status, output] of [[1, good], [null, good], [0, 'No tests found PRIVATE_MARKER'], [0, good + name], [0, name + '\nTotal: 2 tests in 1 file'], [0, null]]) assert.equal(isExpectedList(status, output), false);
});
test('requires exact source hashes', () => {
  const s = '482cd0e6ddcd50022b81fadf8b4df3d644e60454fb4b5f28673d86746be45e37', m = 'ecf574b68b1a42b652bc6bd16a4d1e69f9e6f964ec8c515ba5442f566d38d923';
  assert.equal(hashesMatch(s, m), true); assert.equal(hashesMatch('PRIVATE_MARKER', m), false); assert.equal(hashesMatch(s, 'PRIVATE_MARKER'), false);
});
