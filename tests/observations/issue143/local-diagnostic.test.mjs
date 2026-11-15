import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { summarizeLocal } from './local-diagnostic.mjs';
const hash = '1f36bb58a33602f93a11d3b7e6d0376f9a350729a62e6781b70eea8e4f945735';
const title = 'P6 new same-run synthetic Pages export imports into Local and runs the Python project';
const row = (status, location) => ({ title, file: 'local-import.spec.ts', tests: [{ projectName: 'chromium', expectedStatus: 'passed', results: [{ retry: 0, status, errorLocation: location, errors: [{ message: 'PRIVATE_MARKER_nonpublic_url_code', location }] }] }] });
const report = specs => ({ suites: [{ suites: [{ specs }] }] });
const loc = line => ({ file: '/workspace/tests/observations/issue143/local-import.spec.ts', line });

test('classifies only the exact test, status, expected state and fixed failure location', () => {
  assert.deepEqual(summarizeLocal(report([row('failed', loc(76))]), hash), ['local p6 status=failed expected=passed stage=runtime-version']);
  assert.deepEqual(summarizeLocal(report([row('passed')]), hash), ['local p6 status=passed expected=passed stage=not-applicable']);
});
test('reports absent, timeout, skipped and duplicate tests without inventing success', () => {
  assert.deepEqual(summarizeLocal(report([]), hash), ['local p6 status=not-reported expected=not-reported stage=not-reported']);
  assert.match(summarizeLocal(report([row('timedOut', loc(87))]), hash)[0], /status=timed-out expected=passed stage=grade-result/);
  assert.match(summarizeLocal(report([row('skipped')]), hash)[0], /status=skipped/);
  assert.match(summarizeLocal(report([row('failed'), row('passed')]), hash)[0], /status=ambiguous/);
});
test('never prints arbitrary titles, messages, URLs, paths, source, or unrecognized statuses', () => {
  const malicious = row('PRIVATE_MARKER_status', { file: '/PRIVATE_MARKER_path', line: 49 });
  malicious.tests[0].expectedStatus = 'PRIVATE_MARKER_expected';
  const x = report([malicious, { title: 'PRIVATE_MARKER_title', file: 'local-import.spec.ts', tests: [] }]);
  const out = summarizeLocal(x, hash).join('\n');
  assert.doesNotMatch(out, /PRIVATE_MARKER/);
  assert.match(out, /status=unknown expected=unknown stage=external-or-unknown/);
});
test('rejects mismatched spec hash and malformed or too-large structures', () => {
  assert.deepEqual(summarizeLocal(report([]), 'PRIVATE_MARKER_hash'), ['local-diagnostic spec-mismatch']);
  for (const x of [null, {}, { suites: [{ specs: 'PRIVATE_MARKER' }] }, { suites: Array(1001).fill({}) }]) assert.deepEqual(summarizeLocal(x, hash), ['local-diagnostic report-invalid']);
});
test('unknown location does not become a known stage', () => {
  for (const p of [{ file: '/tmp/PRIVATE_MARKER/local-import.spec.ts', line: 49 }, loc(999)]) {
    const out = summarizeLocal(report([row('failed', p)]), hash)[0];
    assert.match(out, /stage=external-or-unknown/);
    assert.doesNotMatch(out, /PRIVATE_MARKER|runtime-version/);
  }
});

test('distinguishes backend, preview version and preview history and rejects old spec', () => {
  assert.match(summarizeLocal(report([row('failed', loc(50))]), hash)[0], /stage=local-backend/);
  assert.match(summarizeLocal(report([row('failed', loc(76))]), hash)[0], /stage=runtime-version/);
  assert.match(summarizeLocal(report([row('failed', loc(77))]), hash)[0], /stage=preview-history/);
  assert.deepEqual(summarizeLocal(report([]), '26640ed90c40399f06097d22d133abd885dd2a8d720df44f6527a3d85c9338e4'), ['local-diagnostic spec-mismatch']);
});

test('rejects the immediately preceding spec hash after adding passive diagnostics', () => {
  assert.deepEqual(summarizeLocal(report([]), 'e78a20030bcb47f96587abdfac733a84286ce57404932e9298ad0720d7b26abe'), ['local-diagnostic spec-mismatch']);
});
