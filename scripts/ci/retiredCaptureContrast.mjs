import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { summarize } from './retiredCaptureTimingSummary.mjs';

const expected = [
  ['tests/unit/release/v2/retiredMovementCaptureIntegration.test.ts', 2],
  ['tests/unit/runtime/checkQuizProject.test.ts', 16],
  ['tests/content/javascript-review-migration.test.ts', 8],
];
function inspect(report) {
  if (!Array.isArray(report?.testResults) || report.testResults.length !== expected.length)
    throw Error();
  const files = expected.map(([suffix, count]) => {
    const matches = report.testResults.filter(
      (item) => typeof item?.name === 'string' && item.name.endsWith(`/${suffix}`),
    );
    if (matches.length !== 1) throw Error();
    const suite = matches[0];
    if (
      !Array.isArray(suite.assertionResults) ||
      suite.assertionResults.length !== count ||
      !['passed', 'failed'].includes(suite.status) ||
      !Number.isFinite(suite.startTime) ||
      !Number.isFinite(suite.endTime) ||
      suite.startTime < 0 ||
      suite.endTime > 2e12 ||
      suite.endTime < suite.startTime ||
      suite.endTime - suite.startTime > 1800000
    )
      throw Error();
    const entries = suite.assertionResults.map((test) => {
      if (
        typeof test.fullName !== 'string' ||
        test.fullName.length > 2048 ||
        !['passed', 'failed'].includes(test.status)
      )
        throw Error();
      return { name: test.fullName, status: test.status };
    });
    if (new Set(entries.map((entry) => entry.name)).size !== count) throw Error();
    return { suite, entries };
  });
  const names = files
    .flatMap((file, index) => file.entries.map((entry) => `${index}:${entry.name}`))
    .sort();
  const failed = files.some(
    (file) =>
      file.suite.status === 'failed' || file.entries.some((entry) => entry.status === 'failed'),
  );
  const target = files[0].suite;
  const overlap = Math.max(
    ...files
      .slice(1)
      .map(({ suite }) =>
        Math.max(
          0,
          Math.min(target.endTime, suite.endTime) - Math.max(target.startTime, suite.startTime),
        ),
      ),
  );
  const timing = summarize(report);
  const labels = ['retirement', 'quiz', 'migration'];
  const filesSummary = files.map((file, index) => ({
    label: labels[index],
    status:
      file.suite.status === 'failed' || file.entries.some((entry) => entry.status === 'failed')
        ? 'failed'
        : 'passed',
    testSpanMs: Math.round(file.suite.endTime - file.suite.startTime),
  }));
  return {
    names,
    status: failed ? 'failed' : 'passed',
    overlap: Math.round(overlap),
    timing,
    filesSummary,
  };
}
export function compare(defaultReport, cappedReport) {
  try {
    const a = inspect(defaultReport);
    const b = inspect(cappedReport);
    if (JSON.stringify(a.names) !== JSON.stringify(b.names)) throw Error();
    return {
      comparable: a.timing.phase === 'complete' && b.timing.phase === 'complete',
      count: a.names.length,
      defaultStatus: a.status,
      cappedStatus: b.status,
      defaultOverlapMs: a.overlap,
      cappedOverlapMs: b.overlap,
      defaultTiming: a.timing,
      cappedTiming: b.timing,
      defaultFiles: a.filesSummary,
      cappedFiles: b.filesSummary,
    };
  } catch {
    return { comparable: false };
  }
}
async function readReport(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) throw Error();
  return JSON.parse(await readFile(file, 'utf8'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result = { comparable: false };
  try {
    result = compare(await readReport(process.argv[2]), await readReport(process.argv[3]));
  } catch {
    /* fixed output */
  }
  process.stdout.write(`Retired capture contrast: ${JSON.stringify(result)}\n`);
  if (!result.comparable || result.defaultStatus !== 'passed' || result.cappedStatus !== 'passed')
    process.exitCode = 1;
}
