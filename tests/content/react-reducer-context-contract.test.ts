// @vitest-environment node
import { isReducerContextWorkspace } from '../../src/adapters/runtime/react/reducerContextScaffold';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSourceSchema } from '../../scripts/content/sourceSchema';
import { ExerciseSchema, ReactExerciseRuntimeSchema } from '../../src/core/content/schema';
import {
  acceptsReactReducerContextScenarios,
  reactReducerContextScenarios,
} from '../../src/core/content/reactReducerContextInteractions';

it('Reducer・Contextの2単元に実操作を必須とし、公開とauthoringの両方で省略・改ざんを拒否する', async () => {
  const { runtime: course, exercises } = await loadAuthoringCourse('content/react');
  expect(course.publicationStatus).toBe('draft');
  for (const n of [8, 9]) {
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
    const goal = n === 8 ? 'reducer-form' : 'context-sharing';
    expect(exercise.interactionScenarios).toEqual(reactReducerContextScenarios(goal));
    for (const scenarios of [
      undefined,
      [],
      exercise.interactionScenarios!.map((scenario) => ({
        ...scenario,
        actions: scenario.actions.slice(1),
      })),
      reactReducerContextScenarios(n === 8 ? 'context-sharing' : 'reducer-form'),
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
      expect(acceptsReactReducerContextScenarios(goal, scenarios)).toBe(false);
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
    profile: 'reducer-form-v1',
    learningGoal: 'reducer-form',
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

it('整形済みの固定FileをStarter・Solution・全Fixtureで同じWorkspace契約へ結ぶ', async () => {
  const { exercises } = await loadAuthoringCourse('content/react');
  for (const exercise of exercises.filter((exercise) =>
    ['react-ch01-l08-e01', 'react-ch01-l09-e01'].includes(exercise.id),
  )) {
    if (exercise.runtime?.kind !== 'react') throw new Error('React課題が必要です');
    for (const files of [
      exercise.files,
      exercise.solutionFiles,
      ...exercise.fixtures.map((fixture) => fixture.files),
    ]) {
      expect(
        isReducerContextWorkspace(
          Object.fromEntries(files.map((file) => [file.path, file.content])),
          exercise.runtime.profile,
        ),
      ).toBe(true);
    }
  }
});
