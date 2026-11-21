import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkReport } from './check-report.mjs';
const passed = () => ({ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0 }] });
const report = () => ({ errors: [], stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 }, suites: [{ specs: [{ ok: true, tests: [passed()] }, { ok: true, tests: [passed()] }] }] });
test('requires exactly all expected, unretried passes', () => assert.equal(checkReport(report(), 2), 2));
test('rejects omitted, skipped, failed, retried and extra cases', () => {
  for (const mutate of [
    x => x.suites[0].specs.pop(),
    x => { x.stats.skipped = 1; },
    x => { x.suites[0].specs[0].tests[0].results[0].status = 'failed'; },
    x => { x.suites[0].specs[0].tests[0].results[0].retry = 1; },
    x => { x.suites[0].specs.push({ ok: true, tests: [passed()] }); },
    x => { x.errors.push({ message: 'synthetic' }); },
  ]) { const x = report(); mutate(x); assert.throws(() => checkReport(x, 2)); }
});
test('rejects malformed and missing data', () => {
  for (const x of [null, {}, { stats: {}, suites: [] }, { ...report(), errors: undefined }]) assert.throws(() => checkReport(x, 2));
});
