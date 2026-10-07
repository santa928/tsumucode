// @vitest-environment node
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSourceSchema } from '../../scripts/content/sourceSchema';
import { ExerciseSchema, ReactExerciseRuntimeSchema } from '../../src/core/content/schema';
import {
  acceptsReactFormScenarios,
  reactFormScenarios,
} from '../../src/core/content/reactFormInteractions';

it('Form・共有Stateの2単元に実操作を必須とし、公開とauthoringの両方で省略・改ざんを拒否する', async () => {
  const { runtime: course, exercises } = await loadAuthoringCourse('content/react');
  expect(course.publicationStatus).toBe('published');
  for (const n of [6, 7]) {
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
    const goal = n === 6 ? 'controlled-form' : 'shared-state';
    expect(exercise.interactionScenarios).toEqual(reactFormScenarios(goal));
    for (const scenarios of [
      undefined,
      [],
      exercise.interactionScenarios!.map((scenario) => ({
        ...scenario,
        actions: scenario.actions.slice(1),
      })),
      reactFormScenarios(n === 6 ? 'shared-state' : 'controlled-form'),
      exercise.interactionScenarios!.map((scenario) => ({
        ...scenario,
        checkpoints: scenario.checkpoints.map((checkpoint, index) => ({
          ...checkpoint,
          expectations: index === 0 ? checkpoint.expectations.slice(1) : checkpoint.expectations,
        })),
      })),
      exercise.interactionScenarios!.map((scenario) => ({
        ...scenario,
        actions: scenario.actions.map((action) =>
          action.kind === 'fill' ? { ...action, value: 'fixed' } : action,
        ),
      })),
    ]) {
      expect(acceptsReactFormScenarios(goal, scenarios)).toBe(false);
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
    profile: 'controlled-form-v1',
    learningGoal: 'controlled-form',
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
  expect(
    ReactExerciseRuntimeSchema.safeParse({ ...runtime, profile: 'interactive-state-v1' }).success,
  ).toBe(false);
  expect(
    ReactExerciseRuntimeSchema.safeParse({ ...runtime, learningGoal: 'counter' }).success,
  ).toBe(false);
});
