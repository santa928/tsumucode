import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { summarizeUnitSet } from './retiredUnitSetSummary.mjs';
import { summarize } from './retiredCaptureTimingSummary.mjs';

function valid(value) {
  return (
    value?.status === 'ok' &&
    typeof value.reportSuccess === 'boolean' &&
    Number.isSafeInteger(value.lastTestFinishedElapsedMs) &&
    value.lastTestFinishedElapsedMs >= 0 &&
    value.lastTestFinishedElapsedMs <= 1800000 &&
    /^[a-f0-9]{64}$/u.test(value.digest) &&
    ['files', 'failedFiles', 'tests', 'passed', 'failed', 'skipped', 'todo'].every(
      (key) => Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 100000,
    ) &&
    value.files > 0 &&
    value.failedFiles <= value.files &&
    value.tests > 0 &&
    value.tests === value.passed + value.failed + value.skipped + value.todo
  );
}
export function compareUnitSets(a, b) {
  if (!valid(a) || !valid(b)) return { status: 'unavailable' };
  if (
    a.digest !== b.digest ||
    a.files !== b.files ||
    a.tests !== b.tests ||
    a.skipped !== b.skipped ||
    a.todo !== b.todo
  )
    return { status: 'mismatch' };
  return {
    status: 'matched',
    files: a.files,
    tests: a.tests,
    skipped: a.skipped,
    todo: a.todo,
    defaultFailed: a.failed,
    cappedFailed: b.failed,
    defaultFailedFiles: a.failedFiles,
    cappedFailedFiles: b.failedFiles,
    defaultElapsedToLastTestMs: a.lastTestFinishedElapsedMs,
    cappedElapsedToLastTestMs: b.lastTestFinishedElapsedMs,
    defaultSuccess: a.reportSuccess,
    cappedSuccess: b.reportSuccess,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result = { status: 'unavailable' };
  let target = { status: 'unavailable' };
  let defaultTarget = { status: 'unavailable' };
  try {
    const file = 'test-results/retired-capture-raw.json';
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) throw Error();
    const report = JSON.parse(await readFile(file, 'utf8'));
    result = compareUnitSets(
      JSON.parse(process.env.DEFAULT_UNIT_SET || ''),
      summarizeUnitSet(report),
    );
    target = summarize(report);
    defaultTarget = JSON.parse(process.env.DEFAULT_TARGET || '');
  } catch {
    /* fixed output */
  }
  if (
    result.status === 'matched' &&
    (!/^[1-9][0-9]{0,2}$/u.test(process.env.DEFAULT_CAPACITY || '') ||
      process.env.DEFAULT_CAPACITY !== process.env.CAP2_CAPACITY ||
      Number(process.env.DEFAULT_CAPACITY) > 256 ||
      result.files !== 403 ||
      result.tests !== 4677 ||
      result.skipped !== 0 ||
      result.todo !== 0 ||
      target.status !== 'passed' ||
      target.phase !== 'complete' ||
      defaultTarget.status !== 'passed' ||
      defaultTarget.phase !== 'complete')
  ) {
    result = { status: 'unavailable' };
  } else if (
    result.status === 'matched' &&
    (result.defaultFailed !== 0 ||
      result.cappedFailed !== 0 ||
      result.defaultFailedFiles !== 0 ||
      result.cappedFailedFiles !== 0 ||
      !result.defaultSuccess ||
      !result.cappedSuccess)
  ) {
    result = { status: 'failed' };
  }
  process.stdout.write(`Retired unit comparison: ${JSON.stringify(result)}\n`);
  if (result.status !== 'matched') process.exitCode = 1;
}
