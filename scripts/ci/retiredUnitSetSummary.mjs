import { createHash } from 'node:crypto';

/** Return only a bounded digest and counts, never suite names or source data. */
export function summarizeUnitSet(report) {
  try {
    if (
      !Array.isArray(report?.testResults) ||
      report.testResults.length < 1 ||
      report.testResults.length > 5000
    )
      throw Error();
    if (typeof report.success !== 'boolean' || !Number.isFinite(report.startTime)) throw Error();
    let lastEnd = report.startTime;
    const files = new Set();
    let failedFiles = 0;
    const identities = [];
    const counts = { passed: 0, failed: 0, skipped: 0, todo: 0 };
    for (const suite of report.testResults) {
      if (
        typeof suite?.name !== 'string' ||
        !suite.name.startsWith('/workspace/') ||
        suite.name.length > 4096 ||
        files.has(suite.name) ||
        !['passed', 'failed'].includes(suite.status) ||
        !Number.isFinite(suite.endTime) ||
        suite.endTime < report.startTime ||
        !Array.isArray(suite.assertionResults)
      )
        throw Error();
      files.add(suite.name);
      lastEnd = Math.max(lastEnd, suite.endTime);
      if (suite.status === 'failed') failedFiles++;
      identities.push(JSON.stringify(['file', suite.name]));
      for (const entry of suite.assertionResults) {
        if (
          typeof entry?.fullName !== 'string' ||
          entry.fullName.length > 8192 ||
          !Object.hasOwn(counts, entry.status)
        )
          throw Error();
        counts[entry.status]++;
        identities.push(
          JSON.stringify([
            'test',
            suite.name,
            entry.fullName,
            entry.status === 'skipped' ? 'skipped' : entry.status === 'todo' ? 'todo' : 'active',
          ]),
        );
        if (identities.length > 100000) throw Error();
      }
    }
    const total = counts.passed + counts.failed + counts.skipped + counts.todo;
    if (!Number.isSafeInteger(report.numTotalTests) || report.numTotalTests !== total || total < 1)
      throw Error();
    const lastTestFinishedElapsedMs = Math.round(lastEnd - report.startTime);
    if (lastTestFinishedElapsedMs < 0 || lastTestFinishedElapsedMs > 1800000) throw Error();
    const digest = createHash('sha256').update(JSON.stringify(identities.sort())).digest('hex');
    return {
      status: 'ok',
      reportSuccess: report.success,
      lastTestFinishedElapsedMs,
      files: files.size,
      failedFiles,
      tests: total,
      ...counts,
      digest,
    };
  } catch {
    return { status: 'unavailable' };
  }
}
