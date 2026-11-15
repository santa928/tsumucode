const { process, URL, console } = globalThis;
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const specHash = '1f36bb58a33602f93a11d3b7e6d0376f9a350729a62e6781b70eea8e4f945735';
const testTitle = 'P6 new same-run synthetic Pages export imports into Local and runs the Python project';
const allowedFiles = new Set(['local-import.pw-spec.ts', '/workspace/tests/observations/issue143/local-import.pw-spec.ts']);
const status = new Map([['passed', 'passed'], ['failed', 'failed'], ['timedOut', 'timed-out'], ['skipped', 'skipped'], ['interrupted', 'interrupted']]);
const stages = new Map([
  [18, 'input-read'], [19, 'input-hash'], [20, 'input-parse'], [21, 'input-draft'], [22, 'input-lesson'],
  [23, 'input-draft-count'], [24, 'input-files'], [25, 'input-history-count'], [26, 'input-history-status'],
  [27, 'input-passing-snapshot'], [28, 'input-lesson-complete'], [30, 'local-home-navigation'],
  [31, 'local-origin'], [32, 'initial-local-read'], [33, 'initial-local-courses'], [34, 'initial-local-drafts'],
  [35, 'import-upload'], [36, 'import-upload'], [37, 'import-upload'], [38, 'import-preview'],
  [39, 'import-navigation-wait'], [40, 'import-confirmation'], [41, 'import-navigation'],
  [42, 'imported-draft-read'], [43, 'imported-files'], [44, 'imported-history'], [45, 'imported-snapshot'],
  [46, 'imported-course-read'], [47, 'imported-lesson-progress'], [49, 'local-exercise-navigation'],
  [50, 'local-backend'], [51, 'editor-tabs'], [52, 'editor-tab-click'], [53, 'editor-content'],
  [55, 'input-locator'], [56, 'input-empty'], [57, 'input-fill'], [58, 'preview-observer'],
  [63, 'preview-click'], [64, 'preview-output'], [76, 'runtime-version'], [77, 'preview-history'],
  [78, 'preview-snapshot'], [79, 'preview-files'], [80, 'grade-locator'], [81, 'grade-ready'],
  [82, 'grade-request'], [83, 'grade-request'], [84, 'grade-request'], [85, 'grade-click'],
  [86, 'grade-response'], [87, 'grade-result'], [88, 'saved-files-after-grade'], [89, 'input-hash-after'],
]);

export function summarizeLocal(report, actualHash) {
  if (actualHash !== specHash) return ['local-diagnostic spec-mismatch'];
  if (!report || typeof report !== 'object' || !Array.isArray(report.suites)) return ['local-diagnostic report-invalid'];
  const matches = [];
  const queue = [...report.suites];
  let visited = 0;
  while (queue.length) {
    const suite = queue.pop();
    if (++visited > 1000 || !suite || typeof suite !== 'object' ||
        (suite.suites !== undefined && !Array.isArray(suite.suites)) ||
        (suite.specs !== undefined && !Array.isArray(suite.specs))) return ['local-diagnostic report-invalid'];
    for (const child of suite.suites ?? []) queue.push(child);
    for (const spec of suite.specs ?? []) {
      if (!spec || typeof spec !== 'object') return ['local-diagnostic report-invalid'];
      if (spec.title !== testTitle || !allowedFiles.has(spec.file)) continue;
      if (!Array.isArray(spec.tests)) return ['local-diagnostic report-invalid'];
      matches.push(...spec.tests);
    }
  }
  if (!matches.length) return ['local p6 status=not-reported expected=not-reported stage=not-reported'];
  if (matches.length !== 1) return ['local p6 status=ambiguous expected=unknown stage=external-or-unknown'];
  const item = matches[0];
  if (!item || item.projectName !== 'chromium' || !Array.isArray(item.results) || item.results.length !== 1 || item.results[0]?.retry !== 0) {
    return ['local p6 status=ambiguous expected=unknown stage=external-or-unknown'];
  }
  const result = item.results[0];
  const actual = status.get(result.status) ?? 'unknown';
  const expected = status.get(item.expectedStatus) ?? 'unknown';
  let stage = 'not-applicable';
  if (actual !== 'passed') {
    const where = result.errorLocation ?? result.error?.location ?? result.errors?.[0]?.location;
    stage = allowedFiles.has(where?.file) && Number.isSafeInteger(where?.line)
      ? stages.get(where.line) ?? 'external-or-unknown'
      : 'external-or-unknown';
  }
  return [`local p6 status=${actual} expected=${expected} stage=${stage}`];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let file;
  try {
    if (process.argv.length !== 3) throw Error();
    file = await open(process.argv[2], constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw Error();
    const body = await file.readFile('utf8');
    const sha = createHash('sha256').update(await readFile(new URL('./local-import.pw-spec.ts', import.meta.url))).digest('hex');
    for (const line of summarizeLocal(JSON.parse(body), sha)) console.log(line);
  } catch {
    console.log('local-diagnostic report-unavailable');
  } finally {
    await file?.close();
  }
}
