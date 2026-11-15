import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { summarizeHome } from './home-diagnostic.mjs';

const hash = '709bb25b52c9ace02712d51146a955cecb6166cfbc077c75d5de19be5d341095';
const title = id => `${id} resumes the saved exercise and source`;
const testResult = (id, status, location) => ({
  title: title(id), file: 'home-resume.spec.mjs',
  tests: [{ projectName: 'chromium', expectedStatus: 'passed', results: [{
    status, retry: 0, errorLocation: location,
    errors: [{ message: 'PRIVATE_MARKER_url_code', location }],
  }] }],
});
const report = specs => ({ suites: [{ suites: [{ specs }] }] });
const loc = line => ({ file: '/workspace/tests/observations/issue143/home-resume.spec.mjs', line });

test('outputs only predefined course and path, status, expectation and fixed failure stage', () => {
  const x = summarizeHome(report([testResult('course', 'failed', loc(30)), testResult('path', 'passed')]), hash);
  assert.deepEqual(x, [
    'home course status=failed expected=passed stage=resume-link-href',
    'home path status=passed expected=passed stage=not-applicable',
  ]);
});
test('reports missing, skipped, timeout and ambiguity without guessing', () => {
  assert.deepEqual(summarizeHome(report([testResult('course', 'timedOut', loc(32))]), hash), [
    'home course status=timed-out expected=passed stage=resume-exercise-url',
    'home path status=not-reported expected=not-reported stage=not-reported',
  ]);
  assert.match(summarizeHome(report([testResult('path', 'skipped')]), hash)[1], /status=skipped/);
  assert.match(summarizeHome(report([testResult('path', 'failed'), testResult('path', 'passed')]), hash)[1], /status=ambiguous/);
});
test('never prints attacker-controlled title, message, URL, source, filename or status', () => {
  const item = testResult('path', 'PRIVATE_MARKER_status', { file: 'PRIVATE_MARKER_file', line: 30 });
  item.tests[0].expectedStatus = 'PRIVATE_MARKER_expected';
  const x = report([item, { title: 'PRIVATE_MARKER_title', file: 'home-resume.spec.mjs', tests: [] }]);
  const out = summarizeHome(x, hash).join('\n');
  assert.doesNotMatch(out, /PRIVATE_MARKER/);
  assert.match(out, /status=unknown expected=unknown stage=external-or-unknown/);
});
test('rejects changed spec identity and malformed or oversized structures without returning input', () => {
  assert.deepEqual(summarizeHome(report([]), 'PRIVATE_MARKER'), ['home-diagnostic spec-mismatch']);
  for (const x of [null, {}, { suites: [{ specs: 'PRIVATE_MARKER' }] }, { suites: Array(1001).fill({}) }]) {
    assert.deepEqual(summarizeHome(x, hash), ['home-diagnostic report-invalid']);
  }
});
test('unknown path or line never maps to a specific expectation', () => {
  for (const p of [{ file: '/tmp/PRIVATE_MARKER/home-resume.spec.mjs', line: 30 }, loc(999)]) {
    const x = summarizeHome(report([testResult('course', 'failed', p)]), hash).join('\n');
    assert.match(x, /stage=external-or-unknown/);
    assert.doesNotMatch(x, /PRIVATE_MARKER|resume-link-href/);
  }
});
