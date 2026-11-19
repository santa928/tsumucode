// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSchema } from '../../src/core/content/schema';

let course: Awaited<ReturnType<typeof loadAuthoringCourse>>;
// 読取準備には既存のhook枠を使い、課題契約の検査を20秒の本体枠に残す。
beforeAll(async () => {
  course = await loadAuthoringCourse('content/react');
});

it('読書3段階を保持し、別題材で部品境界・所有者を選ぶ課題を次へ接続する', () => {
  const { runtime, exercises } = course;
  const lessons = runtime.phases.flatMap((phase) =>
    phase.chapters.flatMap((chapter) => chapter.lessons),
  );
  const lesson = lessons.find(({ id }) => id === 'react-ch02-l04');
  expect(lesson).toBeDefined();
  expect(lesson?.prerequisiteLessonIds).toContain('react-ch02-l03');
  expect(lesson?.nextLessonId).toBe('react-ch03-l01');
  const exercise = exercises.find(({ id }) => id === 'react-ch02-l04-e01');
  expect(exercise).toBeDefined();
  if (!exercise) return;
  expect(exercise.runtime).toMatchObject({ kind: 'react', profile: 'component-design-v1' });
  expect(exercise.files.map(({ path }) => path).sort()).toEqual([
    'components.tsx',
    'index.html',
    'main.tsx',
  ]);
  const starter = exercise.files.find(({ path }) => path === 'components.tsx')!;
  expect(starter.editable).toBe(true);
  expect(starter.content).toContain('export function App()');
  expect(starter.content).toContain('TODO');
  expect(starter.content).not.toMatch(/\buseState\s*(?:<[^>]+>)?\s*\(/u);
  expect(starter.content).not.toMatch(/(?:interface|type)\s+\w+Props/u);
  expect(
    exercise.fixtures.filter(({ expectedStatus }) => expectedStatus === 'pass').length,
  ).toBeGreaterThanOrEqual(3);
  for (const id of ['unused-display', 'dummy-state', 'one-side-frozen', 'frozen-after-reset']) {
    expect(exercise.fixtures.find((fixture) => fixture.id === id)?.expectedStatus, id).toBe(
      'incomplete',
    );
  }
  // 新課題の存在を既存課題の名前変更で代用しない。
  for (const id of ['react-ch02-l01-e01', 'react-ch02-l02-e01', 'react-ch02-l03-e01']) {
    expect(exercises.find((item) => item.id === id)).toBeDefined();
  }
  const scenario = exercise.interactionScenarios![0]!;
  expect(
    scenario.actions.map((action) => ('selector' in action ? action.selector : undefined)),
  ).toEqual(['#increase', '#increase', '#decrease', '#reset', '#decrease', '#reset', '#increase']);
  expect(
    scenario.checkpoints.map(({ expectations }) =>
      expectations.map((expectation) =>
        expectation.kind === 'selector-text' ? expectation.equals : undefined,
      ),
    ),
  ).toEqual([
    ['21', '69.8'],
    ['22', '71.6'],
    ['21', '69.8'],
    ['20', '68'],
    ['19', '66.2'],
    ['20', '68'],
    ['21', '69.8'],
  ]);
  const published = lessons.flatMap((item) => item.exercises).find(({ id }) => id === exercise.id)!;
  expect(ExerciseSchema.safeParse(published).success).toBe(true);
  for (const interactionScenarios of [
    undefined,
    [],
    [{ ...scenario, actions: scenario.actions.slice(0, 4) }],
    [{ ...scenario, checkpoints: scenario.checkpoints.slice(0, 4) }],
  ]) {
    expect(ExerciseSchema.safeParse({ ...published, interactionScenarios }).success).toBe(false);
  }
});
