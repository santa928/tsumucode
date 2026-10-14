import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { pythonCommand } from './python-profile.mjs';
import {
  expectedPythonOutput,
  PYTHON_LESSONS,
} from '../../src/core/runtime/pythonLessonProfiles.mjs';

const slideOutputs = [
  ['8\n4\n', '1 2 1\n', '5\n', '呼出 1\n負の値\n'],
  [
    'wrapper\n中継用の説明。\n4\n',
    'add\nTrue\n',
    'True\n0\n',
    'checked\n呼出 1\n6\n呼出 2\n負の値\n',
  ],
];

const functionProbe = `
assert decorated is not original
assert original(5, extra=2) == 7
assert {cell.cell_contents for cell in decorated.__closure__ if type(cell.cell_contents) is int} == {4}
assert {cell.cell_contents for cell in double.__closure__ if type(cell.cell_contents) is int} == {2}
def capture(*args, **kwargs):
    return args, kwargs
assert count_calls(capture)(2, 4, label="値") == ((2, 4), {"label": "値"})
sentinel = ValueError("作者の例外identity確認")
def boom(*args, **kwargs):
    raise sentinel
try:
    count_calls(boom)(3, named=4)
except ValueError as error:
    assert error is sentinel
else:
    raise AssertionError("元の例外を中継しませんでした")
print("function-observation: forwarding/state/independent-closure/exception-identity")
`;
const metadataProbe = `
assert original.__doc__
assert decorated.__name__ == original.__name__
assert decorated.__doc__ == original.__doc__
assert decorated.__wrapped__ is original
assert double.__name__ == "double" and double.__doc__
assert double.__wrapped__ is not original
print("function-observation: name/doc/original-reference")
`;

/** 製品の解析wrapperと実Functionで、作者だけが引数・状態・例外identity・metadataを観測する。 */
export async function verifyPythonDecorators(execute) {
  let fixtures = 0;
  for (const number of [1, 2]) {
    const lessonId = `python-oop-ch03-l0${number}`;
    const exerciseId = `${lessonId}-e01`;
    const directory = `content/python-oop/chapters/python-oop-ch03/lessons/${lessonId}`;
    const exerciseDirectory = `${directory}/exercises/${exerciseId}`;
    const exercise = parse(await readFile(`${exerciseDirectory}/exercise.yaml`, 'utf8'));
    const profile = PYTHON_LESSONS[exerciseId].profile;
    const field = number === 1 ? 'decoratorFlowCompared' : 'wrapsMetadataPreserved';
    for (const fixture of exercise.fixtures) {
      const source = await readFile(`${exerciseDirectory}/${fixture.files[0].source}`, 'utf8');
      const command = pythonCommand({ 'main.py': source }, true, profile);
      const [program, ...arguments_] = command.Cmd.slice(command.Cmd.indexOf('-c') + 1);
      const analyzed = await execute(
        `import sys\nsys.argv = ${JSON.stringify(['analysis', ...arguments_])}\n${program}`,
      );
      assert.equal(analyzed.exitCode, 0, `${lessonId}/${fixture.id}: ${analyzed.stderr}`);
      const facts = JSON.parse(analyzed.stdout);
      const executed = await execute(source);
      const status =
        facts.supported !== true
          ? 'system-error'
          : executed.exitCode !== 0
            ? 'code-error'
            : facts[field] === true && executed.stdout === expectedPythonOutput(profile, [])
              ? 'pass'
              : 'incomplete';
      assert.equal(
        status,
        fixture.expectedStatus,
        `${lessonId}/${fixture.id}: ${JSON.stringify(facts)}`,
      );
      if (fixture.expectedStatus === 'system-error') {
        assert.equal(facts.decoratorFlowCompared, false, fixture.id);
        assert.equal(facts.wrapsMetadataPreserved, false, fixture.id);
      }
      if (fixture.id === 'wrong-call') assert.match(executed.stderr, /TypeError/u);
      fixtures += 1;
    }
    const solution = await readFile(`${exerciseDirectory}/solution/main.py`, 'utf8');
    const observed = await execute(solution + functionProbe + (number === 2 ? metadataProbe : ''));
    assert.equal(observed.exitCode, 0, `${lessonId}: ${observed.stderr}`);
    assert.ok(observed.stdout.includes('function-observation:'), lessonId);
    const factory = solution.slice(0, solution.indexOf('\n\ndef add'));
    assert.ok(factory.length > 0, `${lessonId}: 作者用の定義境界がありません`);
    for (const [index, expected] of slideOutputs[number - 1].entries()) {
      const slide = await readFile(`${directory}/slides/s0${index + 1}.md`, 'utf8');
      const snippet = slide.match(/```python\n([\s\S]*?)\n```/u)?.[1];
      assert.ok(snippet, lessonId);
      const prefix =
        index === 3
          ? factory
          : number === 2 && index === 2
            ? 'from functools import wraps\ndef add(value):\n    """1を足す。"""\n    return value + 1\n'
            : '';
      const result = await execute(`${prefix}\n${snippet}`);
      assert.equal(result.exitCode, 0, `${lessonId}/s0${index + 1}: ${result.stderr}`);
      assert.equal(result.stdout, expected, `${lessonId}/s0${index + 1}`);
    }
    console.log(
      JSON.stringify({
        lessonId,
        status: 'passed',
        fixtures: exercise.fixtures.length,
        actualFunctionObservations: 1,
        slideExamples: 4,
      }),
    );
  }
  return { fixtures, actualObjectObservations: 2, slideExamples: 8 };
}
