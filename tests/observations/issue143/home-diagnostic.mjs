const { process, URL, console } = globalThis;
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const specHash = '2c5f51ef7c45e9c2da44bba7ae205666210f111255be41a61918a64c58fd985e';
const allowedFiles = new Set(['home-resume.pw-spec.mjs', '/workspace/tests/observations/issue143/home-resume.pw-spec.mjs']);
const names = new Map([
  ['course resumes the saved exercise and source', 'course'],
  ['path resumes the saved exercise and source', 'path'],
]);
const status = new Map([['passed', 'passed'], ['failed', 'failed'], ['timedOut', 'timed-out'], ['skipped', 'skipped'], ['interrupted', 'interrupted']]);
const stages = new Map([
  [20, 'course-start-and-progress'], [21, 'editor-visible'], [22, 'read-editor'], [23, 'edit-source'],
  [24, 'wait-for-draft'], [25, 'read-draft'], [26, 'saved-source'], [27, 'home-navigation'],
  [28, 'find-card'], [29, 'find-resume-link'], [30, 'resume-link-href'], [31, 'resume-click'],
  [32, 'resume-exercise-url'], [33, 'resumed-editor-source'], [34, 'resumed-saved-source'],
  [35, 'reload'], [36, 'reloaded-editor-source'], [37, 'reloaded-saved-source'],
  [45, 'home-start'], [46, 'open-python-path'], [47, 'start-python-course'], [48, 'slide-sequence'],
  [49, 'slide-sequence'], [50, 'slide-visible'], [51, 'course-progress-saved'],
  [52, 'course-progress-saved'], [53, 'course-progress-saved'], [54, 'course-progress-saved'],
  [55, 'next-slide'], [57, 'course-progress-read'], [58, 'lesson-unfinished'],
  [59, 'open-exercise'], [60, 'exercise-url'],
]);

export function summarizeHome(report, actualHash) {
  if (actualHash !== specHash) return ['home-diagnostic spec-mismatch'];
  if (!report || typeof report !== 'object' || !Array.isArray(report.suites)) return ['home-diagnostic report-invalid'];
  const rows = new Map([['course', []], ['path', []]]);
  const queue = [...report.suites];
  let visited = 0;
  while (queue.length) {
    const suite = queue.pop();
    if (++visited > 1000 || !suite || typeof suite !== 'object' ||
        (suite.suites !== undefined && !Array.isArray(suite.suites)) ||
        (suite.specs !== undefined && !Array.isArray(suite.specs))) return ['home-diagnostic report-invalid'];
    for (const child of suite.suites ?? []) queue.push(child);
    for (const spec of suite.specs ?? []) {
      if (!spec || typeof spec !== 'object') return ['home-diagnostic report-invalid'];
      const name = names.get(spec.title);
      if (!name || !allowedFiles.has(spec.file)) continue;
      if (!Array.isArray(spec.tests)) return ['home-diagnostic report-invalid'];
      rows.get(name).push(...spec.tests);
    }
  }
  return ['course', 'path'].map(name => {
    const matches = rows.get(name);
    if (!matches.length) return `home ${name} status=not-reported expected=not-reported stage=not-reported`;
    if (matches.length !== 1) return `home ${name} status=ambiguous expected=unknown stage=external-or-unknown`;
    const item = matches[0];
    if (!item || item.projectName !== 'chromium' || !Array.isArray(item.results) || item.results.length !== 1 || item.results[0]?.retry !== 0) {
      return `home ${name} status=ambiguous expected=unknown stage=external-or-unknown`;
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
    return `home ${name} status=${actual} expected=${expected} stage=${stage}`;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let file;
  try {
    if (process.argv.length !== 3) throw Error();
    file = await open(process.argv[2], constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw Error();
    const body = await file.readFile('utf8');
    const sha = createHash('sha256').update(await readFile(new URL('./home-resume.pw-spec.mjs', import.meta.url))).digest('hex');
    for (const line of summarizeHome(JSON.parse(body), sha)) console.log(line);
  } catch {
    console.log('home-diagnostic report-unavailable');
  } finally {
    await file?.close();
  }
}
