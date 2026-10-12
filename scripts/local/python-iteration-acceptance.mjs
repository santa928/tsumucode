import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { parse } from 'yaml';
import { pythonLessonAnalysis } from '../../src/core/runtime/pythonLessonAnalysis.mjs';
import {
  expectedPythonOutput,
  PYTHON_LESSONS,
} from '../../src/core/runtime/pythonLessonProfiles.mjs';

import { createPythonAuthorExecutor } from './python-author-execution.mjs';

// 作者の観察を学生の採点packetへ流用しない。
const pyodide = process.argv.includes('--pyodide');
const execute = await createPythonAuthorExecutor('tsumucode-issue144-author');

let count = 0;
for (let number = 1; number <= 3; number += 1) {
  const lessonId = `python-practice-ch01-l0${number}`;
  const exerciseId = `${lessonId}-e01`;
  const directory = `content/python-practice/chapters/python-practice-ch01/lessons/${lessonId}/exercises/${exerciseId}`;
  const exercise = parse(await readFile(`${directory}/exercise.yaml`, 'utf8'));
  const profile = PYTHON_LESSONS[exerciseId].profile;
  const field = ['listComprehensionFiltered', 'iteratorConsumed', 'generatorLifecycle'][number - 1];
  for (const fixture of exercise.fixtures) {
    const source = await readFile(`${directory}/${fixture.files[0].source}`, 'utf8');
    const analysis = pythonLessonAnalysis(source, profile).replace(
      '_lesson_json.dumps({',
      'print(_lesson_json.dumps({',
    );
    const analyzed = await execute(`${analysis.trimEnd()})\n`);
    const executed = await execute(source);
    const facts = analyzed.exitCode === 0 ? JSON.parse(analyzed.stdout) : { supported: false };
    const status =
      executed.exitCode !== 0
        ? 'code-error'
        : !facts.supported
          ? 'system-error'
          : facts[field] && executed.stdout === expectedPythonOutput(profile, [])
            ? 'pass'
            : 'incomplete';
    assert.equal(
      status,
      fixture.expectedStatus,
      `${pyodide ? 'Pyodide' : 'CPython'} ${exerciseId}/${fixture.id}: ${executed.stderr}`,
    );
    count += 1;
  }
}

const generatorRoot =
  'content/python-practice/chapters/python-practice-ch01/lessons/python-practice-ch01-l03/exercises/python-practice-ch01-l03-e01';
const functionSource = (await readFile(`${generatorRoot}/solution/main.py`, 'utf8')).split(
  'items =',
)[0];
const lifecycle = await execute(`
import inspect
import types
import json
import sys
assert sys.version.split()[0] == "3.14.2"
${functionSource}
cursor = iter([3, 5])
assert iter(cursor) is cursor
assert next(cursor, "END") == 3
assert list(cursor) == [5]
assert next(cursor, "END") == "END"
assert next(iter([3, 5]), "END") == 3
assert next(iter([]), "END") == "END"
gen = doubles([3, 5])
assert isinstance(gen, types.GeneratorType)
assert inspect.getgeneratorstate(gen) == "GEN_CREATED"
assert next(gen, "END") == 6
assert inspect.getgeneratorstate(gen) == "GEN_SUSPENDED"
assert next(gen, "END") == 10
assert inspect.getgeneratorstate(gen) == "GEN_SUSPENDED"
assert next(gen, "END") == "END"
assert inspect.getgeneratorstate(gen) == "GEN_CLOSED"
assert next(gen, "END") == "END"
empty = doubles([])
assert inspect.getgeneratorstate(empty) == "GEN_CREATED"
assert next(empty, "END") == "END"
assert inspect.getgeneratorstate(empty) == "GEN_CLOSED"
fresh = doubles([3, 5])
assert list(fresh) == [6, 10]
assert inspect.getgeneratorstate(fresh) == "GEN_CLOSED"
assert next(fresh, "END") == "END"
print(json.dumps({"iterator": "consumed/recreated", "generator": "CREATED/SUSPENDED/CLOSED", "empty": "CLOSED", "list": "consumed"}))
`);
assert.equal(lifecycle.exitCode, 0, lifecycle.stderr);
assert.deepEqual(JSON.parse(lifecycle.stdout.trimEnd().split('\n').at(-1)), {
  iterator: 'consumed/recreated',
  generator: 'CREATED/SUSPENDED/CLOSED',
  empty: 'CLOSED',
  list: 'consumed',
});
console.log(
  JSON.stringify({
    status: 'passed',
    engine: pyodide ? 'Pyodide314.0.7' : 'CPython3.14.2',
    fixtures: count,
    lifecycle: 'real author object observations; no submitted-object claim',
  }),
);
