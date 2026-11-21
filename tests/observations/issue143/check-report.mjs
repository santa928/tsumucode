const { process, console } = globalThis;
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function checkReport(report, expectedCount) {
  if (!report || !Array.isArray(report.errors) || report.errors.length || !Array.isArray(report.suites) ||
      !report.stats || report.stats.expected !== expectedCount || report.stats.skipped !== 0 ||
      report.stats.unexpected !== 0 || report.stats.flaky !== 0) throw Error('Report incomplete');
  const tests = [];
  function visit(suite) {
    if (!suite || (suite.specs !== undefined && !Array.isArray(suite.specs)) ||
        (suite.suites !== undefined && !Array.isArray(suite.suites))) throw Error('Malformed suite');
    for (const spec of suite.specs ?? []) {
      if (spec.ok !== true || !Array.isArray(spec.tests) || !spec.tests.length) throw Error('Invalid spec');
      tests.push(...spec.tests);
    }
    for (const nested of suite.suites ?? []) visit(nested);
  }
  for (const suite of report.suites) visit(suite);
  if (tests.length !== expectedCount) throw Error('Unexpected test count');
  for (const item of tests) {
    if (item.expectedStatus !== 'passed' || item.status !== 'expected' || !Array.isArray(item.results) ||
        item.results.length !== 1 || item.results[0].status !== 'passed' || item.results[0].retry !== 0) {
      throw Error('Test did not pass without retry');
    }
  }
  return tests.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const count = Number(process.argv[3]);
    if (!Number.isSafeInteger(count) || count <= 0) throw Error('Invalid count');
    checkReport(JSON.parse(await readFile(process.argv[2], 'utf8')), count);
    console.log(`Observed ${count} passing tests without retries or skips`);
  } catch {
    console.error('Observation report incomplete or invalid');
    process.exitCode = 1;
  }
}
