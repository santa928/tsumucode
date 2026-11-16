import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = 'links synthetic b930 capture, retirement guard, real prepare and synthetic-receipt admission';

// The report stays private. Only fixed keys, bounded counts, timing and a digest leave this process.
export function summarize(report) {
  try {
    if (!Array.isArray(report?.testResults) || report.testResults.length < 1 || report.testResults.length > 5000 || typeof report.success !== 'boolean' || !Number.isFinite(report.startTime)) throw Error();
    const identities = [];
    const files = new Set();
    const counts = { passed: 0, failed: 0, skipped: 0, todo: 0 };
    const matches = [];
    let failedFiles = 0;
    let lastEnd = report.startTime;
    for (const suite of report.testResults) {
      if (typeof suite?.name !== 'string' || !suite.name.startsWith('/workspace/') || suite.name.length > 4096 || files.has(suite.name) || !['passed', 'failed'].includes(suite.status) || !Number.isFinite(suite.endTime) || suite.endTime < report.startTime || !Array.isArray(suite.assertionResults)) throw Error();
      files.add(suite.name);
      if (suite.status === 'failed') failedFiles++;
      lastEnd = Math.max(lastEnd, suite.endTime);
      identities.push(JSON.stringify(['file', suite.name]));
      for (const item of suite.assertionResults) {
        if (typeof item?.fullName !== 'string' || item.fullName.length > 8192 || !Object.hasOwn(counts, item.status)) throw Error();
        counts[item.status]++;
        identities.push(JSON.stringify(['test', suite.name, item.fullName, item.status === 'skipped' ? 'skipped' : item.status === 'todo' ? 'todo' : 'active']));
        if (identities.length > 100000) throw Error();
        if (item.title === target && suite.name.endsWith('/tests/unit/release/v2/retiredMovementCaptureIntegration.test.ts')) matches.push(item);
      }
    }
    const total = counts.passed + counts.failed + counts.skipped + counts.todo;
    const elapsed = Math.round(lastEnd - report.startTime);
    if (total < 1 || report.numTotalTests !== total || elapsed < 0 || elapsed > 1800000 || matches.length !== 1 || !Number.isFinite(matches[0].duration) || matches[0].duration < 0 || matches[0].duration > 180000) throw Error();
    return { status: 'ok', success: report.success, files: files.size, failedFiles, tests: total, ...counts, lastTestFinishedMs: elapsed, targetStatus: matches[0].status, targetMs: Math.round(matches[0].duration), digest: createHash('sha256').update(JSON.stringify(identities.sort())).digest('hex') };
  } catch { return { status: 'unavailable' }; }
}

export function compare(a, b) {
  if (a.status !== 'ok' || b.status !== 'ok') return { status: 'unavailable' };
  const matched = a.digest === b.digest && a.files === b.files && a.tests === b.tests && a.skipped === 0 && b.skipped === 0 && a.todo === 0 && b.todo === 0;
  return { status: matched ? 'matched' : 'mismatch', default: a, capped: b };
}

async function readReport(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) throw Error();
  return JSON.parse(await readFile(file, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result = { status: 'unavailable' };
  try { result = compare(summarize(await readReport(process.argv[2])), summarize(await readReport(process.argv[3]))); } catch { /* do not expose report data */ }
  process.stdout.write(`Prepush unit comparison: ${JSON.stringify(result)}\n`);
  if (result.status !== 'matched' || result.default.files !== 403 || result.default.tests !== 4694 || !result.default.success || !result.capped.success || result.default.failed !== 0 || result.capped.failed !== 0 || result.default.failedFiles !== 0 || result.capped.failedFiles !== 0 || result.default.targetStatus !== 'passed' || result.capped.targetStatus !== 'passed') process.exitCode = 1;
}
