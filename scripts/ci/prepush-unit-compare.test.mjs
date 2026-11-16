import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, summarize } from './prepush-unit-compare.mjs';

const target = 'links synthetic b930 capture, retirement guard, real prepare and synthetic-receipt admission';
function report() {
  return { success: true, startTime: 1, numTotalTests: 2, testResults: [{ name: '/workspace/tests/unit/release/v2/retiredMovementCaptureIntegration.test.ts', status: 'passed', endTime: 51, assertionResults: [{ title: target, fullName: target, status: 'passed', duration: 20 }, { title: 'other', fullName: 'other', status: 'passed', duration: 3 }] }] };
}
test('compares identical active sets while allowing timing variation', () => {
  const a = report(); const b = report(); b.testResults[0].assertionResults[0].duration = 30;
  assert.equal(compare(summarize(a), summarize(b)).status, 'matched');
});
test('rejects changed test identities and skipped cases', () => {
  const a = report(); const b = report(); b.testResults[0].assertionResults[1].fullName = 'changed';
  assert.equal(compare(summarize(a), summarize(b)).status, 'mismatch');
  b.testResults[0].assertionResults[1].status = 'skipped';
  assert.equal(compare(summarize(a), summarize(b)).status, 'mismatch');
});
test('rejects malformed reports and does not echo contents', () => {
  const a = report(); a.testResults[0].name = 'sensitive-internal-value';
  assert.deepEqual(summarize(a), { status: 'unavailable' });
  assert.equal(compare(summarize(a), summarize(report())).status, 'unavailable');
});
test('detects an actual test failure rather than reporting success', () => {
  const b = report(); b.success = false; b.testResults[0].status = 'failed'; b.testResults[0].assertionResults[0].status = 'failed';
  const result = compare(summarize(report()), summarize(b));
  assert.equal(result.status, 'matched');
  assert.equal(result.capped.success, false);
  assert.equal(result.capped.targetStatus, 'failed');
});
test('rejects a missing target or inconsistent test counts', () => {
  const a = report(); a.testResults[0].assertionResults[0].title = 'missing';
  assert.equal(summarize(a).status, 'unavailable');
  const b = report(); b.numTotalTests = 99;
  assert.equal(summarize(b).status, 'unavailable');
});
test('CLI rejects an undersized report without printing raw content', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prepush-compare-test-'));
  try {
    const a = report(); a.testResults[0].assertionResults[1].fullName = 'private-fixture-marker';
    const f = path.join(dir, 'report.json'); writeFileSync(f, JSON.stringify(a));
    const script = fileURLToPath(new URL('./prepush-unit-compare.mjs', import.meta.url));
    const out = spawnSync(process.execPath, [script, f, f], { encoding: 'utf8', timeout: 10000 });
    assert.equal(out.status, 1);
    assert.equal(out.stdout.includes('private-fixture-marker'), false);
    assert.equal(out.stderr.includes('private-fixture-marker'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
