import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { parse } from 'yaml';
import { pythonLessonAnalysis } from '../../src/core/runtime/pythonLessonAnalysis.mjs';
import { expectedPythonOutput } from '../../src/core/runtime/pythonLessonProfiles.mjs';
import { createPythonAuthorExecutor } from './python-author-execution.mjs';

const execute = await createPythonAuthorExecutor('tsumucode-issue259-author');
const rows = [];
for (const number of [7, 8, 9, 10, 11]) {
  const lesson = `python-basics-ch01-l${String(number).padStart(2, '0')}`;
  const directory = `content/python-basics/chapters/python-basics-ch01/lessons/${lesson}/exercises/${lesson}-e01`;
  const exercise = parse(await readFile(`${directory}/exercise.yaml`, 'utf8'));
  for (const fixture of exercise.fixtures) {
    const source = await readFile(`${directory}/${fixture.files[0].source}`, 'utf8');
    const program = pythonLessonAnalysis(source, exercise.runtime.profile).replace(
      '_lesson_json.dumps({',
      'print(_lesson_json.dumps({',
    );
    const analyzed = await execute(`${program.trimEnd()})\n`);
    const executed = await execute(source);
    const facts = analyzed.exitCode === 0 ? JSON.parse(analyzed.stdout) : { supported: false };
    const status = executed.exitCode !== 0
      ? 'code-error'
      : !facts.supported
        ? 'system-error'
        : facts.functionBehaviorVerified &&
            executed.stdout === expectedPythonOutput(exercise.runtime.profile, [])
          ? 'pass'
          : 'incomplete';
    assert.equal(status, fixture.expectedStatus, `${lesson}/${fixture.id}: ${analyzed.stderr}; ${executed.stderr}`);
    rows.push({ lesson, fixture: fixture.id, status });
  }
}
console.log(JSON.stringify({
  engine: process.argv.includes('--pyodide') ? 'Pyodide314.0.7' : 'CPython3.14.2',
  fixtures: rows.length,
  rows,
}));
