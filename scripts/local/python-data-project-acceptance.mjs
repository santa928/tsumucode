import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { parse } from 'yaml';
import { pythonLessonAnalysis } from '../../src/core/runtime/pythonLessonAnalysis.mjs';
import { expectedPythonOutput } from '../../src/core/runtime/pythonLessonProfiles.mjs';
import { createPythonAuthorExecutor } from './python-author-execution.mjs';

const execute = await createPythonAuthorExecutor('tsumucode-issue146-author');
const directory =
  'content/python-practice/chapters/python-practice-ch03/lessons/python-practice-ch03-l01/exercises/python-practice-ch03-l01-e01';
const profile = 'dataclass-test-project-v1';
const exercise = parse(await readFile(`${directory}/exercise.yaml`, 'utf8'));
let count = 0;
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
        : facts.dataProjectTested && executed.stdout === expectedPythonOutput(profile, [])
          ? 'pass'
          : 'incomplete';
  assert.equal(
    status,
    fixture.expectedStatus,
    `${fixture.id}: analysis=${analyzed.stderr}; execution=${executed.stderr}`,
  );
  count += 1;
}

// 作者だけが生成init・注釈非強制・値検証・実stream終了を直接観察する。
const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
const definitions = solution.slice(0, solution.indexOf('sample ='));
const observation = await execute(`${definitions}
import sys
import json
from dataclasses import fields, is_dataclass
assert sys.version.split()[0] == "3.14.2"
assert is_dataclass(Record)
assert [field.name for field in fields(Record)] == ["label", "amount"]
assert Record.__annotations__ == {"label": str, "amount": int}
assert Record("注釈だけ", "4").amount == "4"
assert Record("生成だけ", -1).amount == -1
streams = []
original_stringio = StringIO

def observed_stream(text):
    stream = original_stringio(text)
    streams.append(stream)
    return stream

StringIO = observed_stream
assert total("2\\n4\\n") == 6
assert total("") == 0
for invalid in ("bad\\n", "-1\\n"):
    try:
        total(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError("invalid data accepted")
assert len(streams) == 4
assert all(stream.closed for stream in streams)
print(json.dumps({"generatedRecord": True, "annotationsAreNotValidation": True, "valuesValidated": True, "allStreamsClosed": True}))
`);
assert.equal(observation.exitCode, 0, observation.stderr);
assert.deepEqual(JSON.parse(observation.stdout), {
  generatedRecord: true,
  annotationsAreNotValidation: true,
  valuesValidated: true,
  allStreamsClosed: true,
});
console.log(
  JSON.stringify({
    status: 'passed',
    engine: process.argv.includes('--pyodide') ? 'Pyodide314.0.7' : 'CPython3.14.2',
    fixtures: count,
    observation: 'real author dataclass and streams; no submitted-object claim',
  }),
);
