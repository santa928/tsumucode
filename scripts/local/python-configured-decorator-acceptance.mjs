import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { pythonCommand } from './python-profile.mjs';
import {
  expectedPythonOutput,
  PYTHON_LESSONS,
} from '../../src/core/runtime/pythonLessonProfiles.mjs';

const lessons = [
  {
    id: 'python-oop-ch03-l03',
    field: 'configuredDecoratorCompared',
    slideOutputs: [
      '加算 1\n5\n',
      '設定 記録\n装飾 add\n呼出 記録\n2\n',
      '共有設定 1\n2\n共有設定 2\n3\n共有設定 1\n4\n',
      '検査 1\n5\n検査 2\n負の値\nchecked\n',
    ],
  },
  {
    id: 'python-oop-ch04-l01',
    field: 'decoratorProjectRecorded',
    slideOutputs: [
      '記録 1\n5\n記録 2\n6\n特典 1\n5\n6 5\n',
      '記録 1\n3\n特典 1\n9\nbook bonus\nTrue\n',
      '記録 1\n2\n記録 2\n負の値\n2\n記録 3\n3\n',
    ],
  },
];

const functionProbe = `
import contextlib as author_context
import io as author_io
def capture(*args, **kwargs):
    """渡された値をそのまま観測する。"""
    return args, kwargs
configured_probe = trace_calls("作者")
left = configured_probe(capture)
right = configured_probe(capture)
different = trace_calls("別")(capture)
recorded = author_io.StringIO()
marker = object()
with author_context.redirect_stdout(recorded):
    assert left(marker, 4, label="値") == ((marker, 4), {"label": "値"})
    assert left(8) == ((8,), {})
    assert right(9) == ((9,), {})
    assert different(10) == ((10,), {})
assert recorded.getvalue() == "作者 1\\n作者 2\\n作者 1\\n別 1\\n"
assert left.__name__ == capture.__name__
assert left.__doc__ == capture.__doc__
assert left.__wrapped__ is capture
assert {cell.cell_contents for cell in left.__closure__ if type(cell.cell_contents) is int} == {2}
assert {cell.cell_contents for cell in right.__closure__ if type(cell.cell_contents) is int} == {1}
sentinel = ValueError("作者の例外identity確認")
def boom(*args, **kwargs):
    raise sentinel
raising = configured_probe(boom)
with author_context.redirect_stdout(recorded):
    try:
        raising(marker, named=3)
    except ValueError as error:
        assert error is sentinel
    else:
        raise AssertionError("元の例外を中継しませんでした")
assert {cell.cell_contents for cell in raising.__closure__ if type(cell.cell_contents) is int} == {1}
print("configured-observation: configuration/independent-state/arguments/result/exception-identity/metadata")
`;

const ledgerProbe = `
assert first.total == 8 and second.total == 14
fresh = Ledger()
other = Ledger()
assert fresh.total == other.total == 0
assert fresh.add(7) == 7 and other.total == 0
try:
    fresh.add(-3)
except ValueError:
    pass
else:
    raise AssertionError("負値を受け入れました")
assert fresh.total == 7
assert book.__wrapped__(fresh, 2, extra=1) == 10
assert bonus.__wrapped__(other, 3, extra=2) == 8
assert fresh.total == 10 and other.total == 8
assert book.__name__ == "book" and bonus.__name__ == "bonus"
assert book.__doc__ and bonus.__doc__
assert book.__doc__ == book.__wrapped__.__doc__
assert bonus.__doc__ == bonus.__wrapped__.__doc__
assert again.__wrapped__ is book.__wrapped__
print("ledger-observation: instance-state/validate-before-update/original-calculation/metadata")
`;

/** 製品解析wrapperと作者だけの直接観測で、設定・装飾・呼出と記録Projectを検証する。 */
export async function verifyPythonConfiguredDecorators(execute) {
  let fixtures = 0;
  for (const lesson of lessons) {
    const chapter = lesson.id.slice(0, 'python-oop-ch03'.length);
    const directory = `content/python-oop/chapters/${chapter}/lessons/${lesson.id}`;
    const exerciseId = `${lesson.id}-e01`;
    const exerciseDirectory = `${directory}/exercises/${exerciseId}`;
    const exercise = parse(await readFile(`${exerciseDirectory}/exercise.yaml`, 'utf8'));
    const profile = PYTHON_LESSONS[exerciseId].profile;
    for (const fixture of exercise.fixtures) {
      const source = await readFile(`${exerciseDirectory}/${fixture.files[0].source}`, 'utf8');
      const command = pythonCommand({ 'main.py': source }, true, profile);
      const [program, ...arguments_] = command.Cmd.slice(command.Cmd.indexOf('-c') + 1);
      const analyzed = await execute(
        `import sys\nsys.argv = ${JSON.stringify(['analysis', ...arguments_])}\n${program}`,
      );
      assert.equal(analyzed.exitCode, 0, `${lesson.id}/${fixture.id}: ${analyzed.stderr}`);
      const facts = JSON.parse(analyzed.stdout);
      const executed = await execute(source);
      const status =
        facts.supported !== true
          ? 'system-error'
          : executed.exitCode !== 0
            ? 'code-error'
            : facts[lesson.field] === true && executed.stdout === expectedPythonOutput(profile, [])
              ? 'pass'
              : 'incomplete';
      assert.equal(
        status,
        fixture.expectedStatus,
        `${lesson.id}/${fixture.id}: ${JSON.stringify(facts)}; ${executed.stderr}`,
      );
      if (fixture.expectedStatus === 'system-error') {
        assert.equal(facts.configuredDecoratorCompared, false, fixture.id);
        assert.equal(facts.decoratorProjectRecorded, false, fixture.id);
      }
      if (fixture.id === 'wrong-call') assert.match(executed.stderr, /TypeError/u);
      fixtures += 1;
    }
    const solution = await readFile(`${exerciseDirectory}/solution/main.py`, 'utf8');
    const observed = await execute(
      solution + functionProbe + (lesson.id.includes('ch04') ? ledgerProbe : ''),
    );
    assert.equal(observed.exitCode, 0, `${lesson.id}: ${observed.stderr}`);
    assert.ok(observed.stdout.includes('configured-observation:'), lesson.id);
    const marker = lesson.id.includes('ch04') ? '\nprint(book(first' : '\nprint(decorated(3';
    const boundary = solution.indexOf(marker);
    assert.ok(boundary > 0, '作者用の観察境界がありません');
    const definitions = solution.slice(0, boundary);
    for (const [index, expected] of lesson.slideOutputs.entries()) {
      const slide = await readFile(`${directory}/slides/s0${index + 1}.md`, 'utf8');
      const snippet = slide.match(/```python\n([\s\S]*?)\n```/u)?.[1];
      assert.ok(snippet, lesson.id);
      const result = await execute(`${definitions}\n${snippet}`);
      assert.equal(result.exitCode, 0, `${lesson.id}/s0${index + 1}: ${result.stderr}`);
      assert.equal(result.stdout, expected, `${lesson.id}/s0${index + 1}`);
    }
    console.log(
      JSON.stringify({
        lessonId: lesson.id,
        status: 'passed',
        fixtures: exercise.fixtures.length,
        actualFunctionObservations: 1,
        slideExamples: lesson.slideOutputs.length,
      }),
    );
  }
  return { fixtures, actualObjectObservations: 2, slideExamples: 7 };
}
