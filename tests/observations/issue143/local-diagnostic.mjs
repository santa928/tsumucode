import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const specHash = 'e78a20030bcb47f96587abdfac733a84286ce57404932e9298ad0720d7b26abe';
const testTitle = 'P6 new same-run synthetic Pages export imports into Local and runs the Python project';
const allowedFiles = new Set(['local-import.spec.ts', '/workspace/tests/observations/issue143/local-import.spec.ts']);
const status = new Map([['passed', 'passed'], ['failed', 'failed'], ['timedOut', 'timed-out'], ['skipped', 'skipped'], ['interrupted', 'interrupted']]);
const stages = new Map([
  [17, 'input-read'], [18, 'input-hash'], [19, 'input-parse'], [20, 'input-draft'], [21, 'input-lesson'],
  [22, 'input-draft-count'], [23, 'input-files'], [24, 'input-history-count'], [25, 'input-history-status'],
  [26, 'input-passing-snapshot'], [27, 'input-lesson-complete'], [29, 'local-home-navigation'],
  [30, 'local-origin'], [31, 'initial-local-read'], [32, 'initial-local-courses'], [33, 'initial-local-drafts'],
  [34, 'import-upload'], [35, 'import-upload'], [36, 'import-upload'], [37, 'import-preview'],
  [38, 'import-navigation-wait'], [39, 'import-confirmation'], [40, 'import-navigation'],
  [41, 'imported-draft-read'], [42, 'imported-files'], [43, 'imported-history'], [44, 'imported-snapshot'],
  [45, 'imported-course-read'], [46, 'imported-lesson-progress'], [48, 'local-exercise-navigation'],
  [49, 'local-backend'], [50, 'editor-tabs'], [51, 'editor-tab-click'], [52, 'editor-content'],
  [54, 'input-locator'], [55, 'input-empty'], [56, 'input-fill'], [57, 'preview-click'], [58, 'preview-output'],
  [59, 'runtime-version'], [60, 'preview-history'], [61, 'preview-snapshot'], [62, 'preview-files'],
  [63, 'grade-locator'], [64, 'grade-ready'], [65, 'grade-request'], [66, 'grade-request'],
  [67, 'grade-request'], [68, 'grade-click'], [69, 'grade-response'], [70, 'grade-result'],
  [71, 'saved-files-after-grade'], [72, 'input-hash-after'],
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
    const sha = createHash('sha256').update(await readFile(new URL('./local-import.spec.ts', import.meta.url))).digest('hex');
    for (const line of summarizeLocal(JSON.parse(body), sha)) console.log(line);
  } catch {
    console.log('local-diagnostic report-unavailable');
  } finally {
    await file?.close();
  }
}
