const titles = [
  'python-practice/python-practice-ch02-l01 actual learning UI',
  'python-practice/python-practice-ch03-l01 actual learning UI',
];
const phases = new Set([
  'setup',
  'opening',
  'writing-starter',
  'writing-solution',
  'history-before',
  'history',
  'click',
  'feedback',
  'saved-files',
]);
const states = new Set(['pass', 'incomplete', 'code-error', 'other', null]);
const results = new Set(['expected', 'unexpected', 'flaky', 'skipped']);

/** Emit only named test results and the bounded diagnostic annotation. */
export function summarizeManifestDiagnostic(input) {
  const found = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      if (!titles.includes(spec.title)) continue;
      for (const test of spec.tests ?? []) {
        if (!results.has(test.status)) throw new Error('Invalid diagnostic status');
        const rows = (test.annotations ?? []).filter(
          (row) => row.type === 'manifest-learning-diagnostic',
        );
        if (rows.length > 1) throw new Error('Duplicate diagnostic annotation');
        let diagnostic = null;
        if (rows.length === 1) {
          const d = JSON.parse(rows[0].description);
          const keys = ['afterCapped', 'beforeCapped', 'grew', 'phase', 'round', 'status'];
          const count = (n) => n === null || (Number.isInteger(n) && n >= 0 && n <= 20);
          if (
            !d ||
            typeof d !== 'object' ||
            Array.isArray(d) ||
            Object.keys(d).sort().join() !== keys.join() ||
            !phases.has(d.phase) ||
            !Number.isInteger(d.round) ||
            d.round < 0 ||
            d.round > 4 ||
            !count(d.beforeCapped) ||
            !count(d.afterCapped) ||
            ![true, false, null].includes(d.grew) ||
            !states.has(d.status)
          )
            throw new Error('Invalid diagnostic annotation');
          diagnostic = {
            phase: d.phase,
            round: d.round,
            beforeCapped: d.beforeCapped,
            afterCapped: d.afterCapped,
            grew: d.grew,
            status: d.status,
          };
        }
        found.push({
          lesson: spec.title === titles[0] ? 'ch02' : 'ch03',
          status: test.status,
          diagnostic,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of input.suites ?? []) visit(suite);
  if (found.length !== 2 || new Set(found.map((row) => row.lesson)).size !== 2)
    throw new Error('Diagnostic selection mismatch');
  return {
    scope: 'synthetic-webkit-diagnostic-only',
    tests: found.sort((a, b) => a.lesson.localeCompare(b.lesson)),
  };
}
