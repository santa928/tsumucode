import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { parse } from 'yaml';
import { pythonLessonAnalysis } from '../../src/core/runtime/pythonLessonAnalysis.mjs';
import {
  expectedPythonOutput,
  PYTHON_FACT_FIELDS,
} from '../../src/core/runtime/pythonLessonProfiles.mjs';
import { parsePythonAnalysis } from './python-profile.mjs';
import { createPythonAuthorExecutor } from './python-author-execution.mjs';

const execute = await createPythonAuthorExecutor('tsumucode-issue259-list-author');
// --fixture=values/name で個別回帰、--lesson=values でLesson全件を指定する。
const selected = new Set(
  process.argv
    .filter((arg) => arg.startsWith('--fixture='))
    .map((arg) => arg.slice('--fixture='.length)),
);
const selectedLessons = new Set(
  process.argv
    .filter((arg) => arg.startsWith('--lesson='))
    .map((arg) => arg.slice('--lesson='.length)),
);
const observed = new Set();
const rows = [];
for (const suffix of ['values', 'iterate']) {
  if (selectedLessons.size && !selectedLessons.has(suffix)) continue;
  const lesson = `python-basics-ch01-l05-${suffix}`;
  const directory = `content/python-basics/chapters/python-basics-ch01/lessons/${lesson}/exercises/${lesson}-e01`;
  const exercise = parse(await readFile(`${directory}/exercise.yaml`, 'utf8'));
  const field = PYTHON_FACT_FIELDS[exercise.validationRules[0].assertion.fact];
  for (const fixture of exercise.fixtures) {
    const key = `${suffix}/${fixture.id}`;
    if (selected.size && !selected.has(key)) continue;
    observed.add(key);
    try {
      const source = await readFile(`${directory}/${fixture.files[0].source}`, 'utf8');
      const program =
        'import sys as _lesson_sys\n' +
        pythonLessonAnalysis(source, exercise.runtime.profile).replace(
          '_lesson_json.dumps({',
          'print(_lesson_json.dumps({"version": _lesson_sys.version.split()[0],',
        );
      const analyzed = await execute(`${program.trimEnd()})\n`);
      assert.equal(analyzed.exitCode, 0, `${lesson}/${fixture.id} AST: ${analyzed.stderr}`);
      const facts = JSON.parse(analyzed.stdout);
      // CPythonではcontrollerの厳密なpacket検査も実観測で通す。
      if (!process.argv.includes('--pyodide')) {
        parsePythonAnalysis(analyzed.stdout, '', 0, exercise.runtime.profile);
      }
      const executed = await execute(source);
      const status =
        executed.exitCode !== 0
          ? 'code-error'
          : !facts.supported
            ? 'system-error'
            : facts[field] && executed.stdout === expectedPythonOutput(exercise.runtime.profile, [])
              ? 'pass'
              : 'incomplete';
      rows.push({
        lesson,
        fixture: fixture.id,
        status,
        expectedStatus: fixture.expectedStatus,
        matches: status === fixture.expectedStatus,
        supported: facts.supported,
        fact: { field, value: facts[field] },
        stdout: executed.stdout,
        stderr: executed.stderr,
      });
    } catch (error) {
      rows.push({
        lesson,
        fixture: fixture.id,
        status: 'harness-error',
        expectedStatus: fixture.expectedStatus,
        matches: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
const missingFixtures = [...selected].filter((key) => !observed.has(key));
const missingLessons = [...selectedLessons].filter(
  (lesson) => !['values', 'iterate'].includes(lesson),
);
const mismatches = rows.filter((row) => !row.matches).length;
process.exitCode =
  missingFixtures.length || missingLessons.length || mismatches || rows.length === 0 ? 1 : 0;
console.log(
  JSON.stringify({
    engine: process.argv.includes('--pyodide') ? 'Pyodide314.0.7' : 'CPython3.14.2',
    fixtures: rows.length,
    mismatches,
    missingFixtures,
    missingLessons,
    rows,
  }),
);
