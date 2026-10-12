import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { parse } from 'yaml';
import { pythonLessonAnalysis } from '../../src/core/runtime/pythonLessonAnalysis.mjs';
import { expectedPythonOutput } from '../../src/core/runtime/pythonLessonProfiles.mjs';
import { createPythonAuthorExecutor } from './python-author-execution.mjs';

const execute = await createPythonAuthorExecutor('tsumucode-issue145-author');
const directory =
  'content/python-practice/chapters/python-practice-ch02/lessons/python-practice-ch02-l01/exercises/python-practice-ch02-l01-e01';
const profile = 'context-manager-close-v1';
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
        : facts.contextManagedClosed && executed.stdout === expectedPythonOutput(profile, [])
          ? 'pass'
          : 'incomplete';
  assert.equal(status, fixture.expectedStatus, `${fixture.id}: ${executed.stderr}`);
  count += 1;
}

// 作者だけが実objectと終了後の利用不能を直接観察する。提出の状態証拠にはしない。
const observation = await execute(`
import sys
import json
from io import StringIO
assert sys.version.split()[0] == "3.14.2"
with StringIO("通常") as normal:
    assert isinstance(normal, StringIO)
    assert normal.getvalue() == "通常"
    assert normal.closed is False
assert normal.closed is True
try:
    with StringIO("例外") as broken:
        assert broken.closed is False
        raise ValueError("中断")
except ValueError:
    pass
assert broken.closed is True
for stream in (normal, broken):
    try:
        stream.getvalue()
    except ValueError:
        pass
    else:
        raise AssertionError("closed buffer remained usable")
    stream.close()
    assert stream.closed is True
with StringIO("") as empty:
    assert empty.getvalue() == ""
    assert empty.closed is False
assert empty.closed is True
print(json.dumps({"normalClosed": True, "exceptionClosed": True, "closedUseRejected": True, "emptyClosed": True}))
`);
assert.equal(observation.exitCode, 0, observation.stderr);
assert.deepEqual(JSON.parse(observation.stdout), {
  normalClosed: true,
  exceptionClosed: true,
  closedUseRejected: true,
  emptyClosed: true,
});
console.log(
  JSON.stringify({
    status: 'passed',
    engine: process.argv.includes('--pyodide') ? 'Pyodide314.0.7' : 'CPython3.14.2',
    fixtures: count,
    observation: 'real author StringIO objects; no submitted-object claim',
  }),
);
