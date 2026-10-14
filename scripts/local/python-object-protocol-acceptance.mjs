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
    field: 'inheritanceDelegationCompared',
    anchor: 'base = Counter(3)',
    outputs: ['2\n3\n', '9\n', '6\n', '8\n9\n'],
    definitionsAt: [3],
    probe: `
assert isinstance(child, Counter)
assert not isinstance(view, Counter)
assert TripledCounter.__init__ is Counter.__init__
assert view.counter is base and other_view.counter is other
assert child.value == 3 and base.value == 4 and other.value == 5
other.value = 7
assert other_view.read() == 14 and view.read() == 8 and child.calculate() == 9
print("object-observation: inheritance/delegation/explicit-sharing")
`,
  },
  {
    field: 'propertyRangeValidated',
    anchor: 'first = Score(70)',
    outputs: ['70\n', '90\n', '範囲外\n70\n', '90\n50\n'],
    definitionsAt: [2, 3],
    probe: `
assert isinstance(Score.value, property)
assert Score.value.fget is not None and Score.value.fset is not None
assert first.value == 100 and second.value == 50
first.value = 25
for invalid in [-2, 102]:
    try:
        first.value = invalid
    except ValueError:
        pass
    else:
        raise AssertionError("範囲外を拒否しませんでした")
    assert first.value == 25
try:
    Score(101)
except ValueError:
    pass
else:
    raise AssertionError("初期値の検証を通りませんでした")
assert Score.value.fget(first) == 25 and second.value == 50
print("object-observation: property/read/write/rejection/initialization")
`,
  },
  {
    field: 'dunderProtocolsUsed',
    anchor: 'titles = ["A", "B"]',
    outputs: ['2\n', '本:2\n', '2\n3\n', '文字列が必要\n'],
    definitionsAt: [],
    probe: `
assert shelf.titles is not titles and shelf.titles is not empty.titles
assert ReadingList.__len__(shelf) == len(shelf) == 3
assert ReadingList.__str__(shelf) == str(shelf) == "本:3"
assert len(empty) == 0 and str(empty) == "本:0"
titles.append("E")
assert len(shelf) == 3
shelf.titles.append("F")
assert len(shelf) == 4 and len(empty) == 0
print("object-observation: len/str/return-types/shallow-copy")
`,
  },
];

/** 同じ実engineを使い、作者だけがobject・Property・dunderを直接観測する。 */
export async function verifyPythonObjectProtocols(execute) {
  let fixtures = 0;
  for (const [index, lesson] of lessons.entries()) {
    const lessonId = `python-oop-ch02-l0${String(index + 1)}`;
    const exerciseId = `${lessonId}-e01`;
    const directory = `content/python-oop/chapters/python-oop-ch02/lessons/${lessonId}`;
    const exerciseDirectory = `${directory}/exercises/${exerciseId}`;
    const exercise = parse(await readFile(`${exerciseDirectory}/exercise.yaml`, 'utf8'));
    const profile = PYTHON_LESSONS[exerciseId].profile;
    for (const fixture of exercise.fixtures) {
      const source = await readFile(`${exerciseDirectory}/${fixture.files[0].source}`, 'utf8');
      // 製品の解析wrapperへ同じargvを渡し、文字列の字下げも含めて検証する。
      const command = pythonCommand({ 'main.py': source }, true, profile);
      const [program, ...arguments_] = command.Cmd.slice(command.Cmd.indexOf('-c') + 1);
      const analyzed = await execute(
        `import sys\nsys.argv = ${JSON.stringify(['analysis', ...arguments_])}\n${program}`,
      );
      assert.equal(analyzed.exitCode, 0, `${exerciseId}/${fixture.id}: ${analyzed.stderr}`);
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
        `${exerciseId}/${fixture.id}: ${JSON.stringify(facts)}`,
      );
      if (fixture.expectedStatus === 'system-error') {
        for (const entry of lessons) assert.equal(facts[entry.field], false, fixture.id);
      }
      if (['wrong-call', 'wrong-length-type', 'wrong-string-type'].includes(fixture.id)) {
        assert.match(executed.stderr, /TypeError/u);
      }
      fixtures += 1;
    }
    const solution = await readFile(`${exerciseDirectory}/solution/main.py`, 'utf8');
    const observed = await execute(solution + lesson.probe);
    assert.equal(observed.exitCode, 0, `${lessonId}: ${observed.stderr}`);
    assert.ok(observed.stdout.includes('object-observation:'), lessonId);
    const definition = solution.slice(0, solution.indexOf(`\n${lesson.anchor}`));
    assert.ok(definition.length > 0, `${lessonId}: Class定義の境界がありません`);
    for (const [slideIndex, expected] of lesson.outputs.entries()) {
      const slide = await readFile(`${directory}/slides/s0${String(slideIndex + 1)}.md`, 'utf8');
      const snippet = slide.match(/```python\n([\s\S]*?)\n```/u)?.[1];
      assert.ok(snippet, lessonId);
      const program = lesson.definitionsAt.includes(slideIndex)
        ? `${definition}\n${snippet}`
        : snippet;
      const result = await execute(program);
      assert.equal(result.exitCode, 0, `${lessonId}/s0${String(slideIndex + 1)}: ${result.stderr}`);
      assert.equal(result.stdout, expected, `${lessonId}/s0${String(slideIndex + 1)}`);
    }
    console.log(
      JSON.stringify({
        lessonId,
        status: 'passed',
        fixtures: exercise.fixtures.length,
        actualObjectObservations: 1,
        slideExamples: 4,
      }),
    );
  }
  return { fixtures, actualObjectObservations: 3, slideExamples: 12 };
}
