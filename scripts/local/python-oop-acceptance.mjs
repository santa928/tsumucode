import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { parse } from 'yaml';
import { pythonLessonAnalysis } from '../../src/core/runtime/pythonLessonAnalysis.mjs';
import {
  expectedPythonOutput,
  PYTHON_LESSONS,
} from '../../src/core/runtime/pythonLessonProfiles.mjs';
import { createPythonAuthorExecutor } from './python-author-execution.mjs';

// 作者だけがobjectを直接観察する。学生の採点は固定AST事実と実stdoutの照合を維持する。
const execute = await createPythonAuthorExecutor('tsumucode-issue148-author');
let count = 0;
for (let number = 1; number <= 2; number += 1) {
  const lesson = `python-oop-ch01-l0${number}`;
  const exerciseId = `${lesson}-e01`;
  const directory = `content/python-oop/chapters/python-oop-ch01/lessons/${lesson}/exercises/${exerciseId}`;
  const exercise = parse(await readFile(`${directory}/exercise.yaml`, 'utf8'));
  const profile = PYTHON_LESSONS[exerciseId].profile;
  const field = number === 1 ? 'classInstanceCompared' : 'methodsCompared';
  for (const fixture of exercise.fixtures) {
    const source = await readFile(`${directory}/${fixture.files[0].source}`, 'utf8');
    const program = pythonLessonAnalysis(source, profile).replace(
      '_lesson_json.dumps({',
      'print(_lesson_json.dumps({',
    );
    const analyzed = await execute(`${program.trimEnd()})\n`);
    const executed = await execute(source);
    const facts = analyzed.exitCode === 0 ? JSON.parse(analyzed.stdout) : { supported: false };
    const status =
      executed.exitCode !== 0
        ? 'code-error'
        : facts.supported !== true
          ? 'system-error'
          : facts[field] === true && executed.stdout === expectedPythonOutput(profile, [])
            ? 'pass'
            : 'incomplete';
    assert.equal(
      status,
      fixture.expectedStatus,
      `${exerciseId}/${fixture.id}: ${JSON.stringify(facts)}`,
    );
    count += 1;
  }
  const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
  const probe =
    number === 1
      ? `
assert first is alias
assert first is not second
assert first.value == 3 and second.value == 5
assert first.__dict__["factor"] == 7
assert "factor" not in second.__dict__ and second.factor == Counter.factor == 4
alias.value = 11
assert first.value == 11 and second.value == 5
print("object-observation: identity/individual-value/shadow/fallback")
`
      : `
assert first.doubled.__self__ is first
assert Counter.doubled_from.__self__ is Counter
assert isinstance(Counter.__dict__["doubled_from"], classmethod)
assert isinstance(Counter.__dict__["doubled_value"], staticmethod)
assert not hasattr(Counter.doubled_value, "__self__")
assert first.doubled() == Counter.doubled(first) == Counter.doubled_from(3) == 12
assert Counter.doubled_value(3, 2) == 6
print("object-observation: instance-binding/class-binding/no-binding")
`;
  const observed = await execute(solution + probe);
  assert.equal(observed.exitCode, 0, observed.stderr);
  assert.ok(observed.stdout.includes('object-observation:'), observed.stdout);
  const outputs =
    number === 1
      ? ['3\n5\n', 'True\nFalse\n', '7\n4\n']
      : ['6\n6\n', '6\n12\n', '6\n6\n', '6\n6\n6\n6\n'];
  for (let index = 0; index < outputs.length; index += 1) {
    const slide = await readFile(
      `content/python-oop/chapters/python-oop-ch01/lessons/${lesson}/slides/s0${index + 1}.md`,
      'utf8',
    );
    const snippet = slide.match(/```python\n([\s\S]*?)\n```/u)?.[1];
    assert.ok(snippet, 'SlideのPython例がありません');
    // 比較の最後の断片だけは、本文で明示した演習の全定義と倍率2を前提にする。
    const program =
      number === 2 && index === 3 ? solution + '\nCounter.factor = 2\n' + snippet : snippet;
    const result = await execute(program);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(
      number === 2 && index === 3
        ? result.stdout.slice(expectedPythonOutput(profile, []).length)
        : result.stdout,
      outputs[index],
    );
  }
}
console.log(
  JSON.stringify({
    engine: process.argv.includes('--pyodide') ? 'Pyodide 314.0.7' : 'CPython 3.14.2',
    fixtures: count,
    actualObjectObservations: 2,
    slideExamples: 7,
    retries: 0,
  }),
);
