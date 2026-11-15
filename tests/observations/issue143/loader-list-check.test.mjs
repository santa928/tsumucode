import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { hashesMatch, isExpectedList } from './loader-list-check.mjs';
const name = 'P6 new same-run synthetic Pages export imports into Local and runs the Python project';
const good = `Listing tests:\n  [chromium] › local-import.spec.ts:15:1 › ${name}\nTotal: 1 test in 1 file\n`;
test('requires successful collection of the unique expected test', () => {
  assert.equal(isExpectedList(0, good), true);
  for (const [status, output] of [[1, good], [null, good], [0, 'No tests found PRIVATE_MARKER'], [0, good + name], [0, name + '\nTotal: 2 tests in 1 file'], [0, null]]) assert.equal(isExpectedList(status, output), false);
});
test('requires exact source hashes', () => {
  const s = '1f36bb58a33602f93a11d3b7e6d0376f9a350729a62e6781b70eea8e4f945735', m = '0045edb75678d7b820a16d3a0ddbfcdc649afebe7aee8a463b6fbf5f2da47ea6';
  assert.equal(hashesMatch(s, m), true); assert.equal(hashesMatch('PRIVATE_MARKER', m), false); assert.equal(hashesMatch(s, 'PRIVATE_MARKER'), false);
});

test('both synthetic observations use the same source-bound export schema', async () => {
  const extract = text => text.match(/const syntheticProgressSchema = (.*);$/mu)?.[1];
  const pages = extract(await readFile(new URL('./pages-export.spec.ts', import.meta.url), 'utf8'));
  const local = extract(await readFile(new URL('./local-import.spec.ts', import.meta.url), 'utf8'));
  assert.ok(pages);
  assert.equal(local, pages);
});
