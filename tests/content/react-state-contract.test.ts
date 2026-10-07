// @vitest-environment node
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSourceSchema } from '../../scripts/content/sourceSchema';
import { ExerciseSchema, ReactExerciseRuntimeSchema } from '../../src/core/content/schema';
import {
  acceptsReactStateScenarios,
  reactStateScenarios,
} from '../../src/core/content/reactStateInteractions';

it('Stateの2単元に実操作を必須とし、公開とauthoringの両方で省略・改ざんを拒否する', async () => {
  const { runtime: course, exercises } = await loadAuthoringCourse('content/react');
  expect(course.publicationStatus).toBe('draft');
  for (const n of [4, 5]) {
    const id = `react-ch01-l0${String(n)}-e01`;
    const exercise = exercises.find((exercise) => exercise.id === id)!;
    const lesson = course.phases[0]!.chapters[0]!.lessons.find((lesson) =>
      lesson.exercises.some((exercise) => exercise.id === id),
    )!;
    const published = lesson.exercises.find((exercise) => exercise.id === id)!;
    const file = `content/react/chapters/react-ch01/lessons/react-ch01-l0${String(n)}/exercises/${id}/exercise.yaml`;
    const source = ExerciseSourceSchema.parse(YAML.parse(await readFile(file, 'utf8')));
    expect(ExerciseSourceSchema.safeParse(source).success).toBe(true);
    expect(ExerciseSchema.safeParse(published).success).toBe(true);
    const goal = n === 4 ? 'counter' : 'immutable-list';
    expect(exercise.interactionScenarios).toEqual(reactStateScenarios(goal));
    for (const scenarios of [
      undefined,
      [],
      exercise.interactionScenarios!.map((scenario) => ({
        ...scenario,
        actions: scenario.actions.slice(1),
      })),
      reactStateScenarios(n === 4 ? 'immutable-list' : 'counter'),
    ]) {
      expect(acceptsReactStateScenarios(goal, scenarios)).toBe(false);
      expect(
        ExerciseSourceSchema.safeParse({ ...source, interactionScenarios: scenarios }).success,
      ).toBe(false);
      expect(
        ExerciseSchema.safeParse({ ...published, interactionScenarios: scenarios }).success,
      ).toBe(false);
    }
  }
});

it('Hookのprofileと学習目標を静的Props/childrenの契約へ混ぜない', () => {
  const runtime = {
    kind: 'react',
    entryFile: 'main.tsx',
    sourceType: 'module',
    capabilityProfile: 'dom',
    primaryOutput: 'preview',
    profile: 'interactive-state-v1',
    learningGoal: 'counter',
  };
  expect(ReactExerciseRuntimeSchema.safeParse(runtime).success).toBe(true);
  expect(
    ReactExerciseRuntimeSchema.safeParse({ ...runtime, learningGoal: 'composition' }).success,
  ).toBe(false);
  expect(
    ReactExerciseRuntimeSchema.safeParse({ ...runtime, profile: 'static-components-v1' }).success,
  ).toBe(false);
  expect(
    ReactExerciseRuntimeSchema.safeParse({ ...runtime, profile: 'props-card-v1' }).success,
  ).toBe(false);
});
