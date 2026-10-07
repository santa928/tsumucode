// @vitest-environment node
import { isHookWorkspace } from '../../src/adapters/runtime/react/hookScaffold';
import { analyzeRef } from '../../src/adapters/runtime/react/checkRefSource';
import { analyzeExternalSource } from '../../src/adapters/runtime/react/checkExternalSource';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSourceSchema } from '../../scripts/content/sourceSchema';
import { ExerciseSchema, ReactExerciseRuntimeSchema } from '../../src/core/content/schema';
import {
  acceptsReactHookScenarios,
  reactHookScenarios,
} from '../../src/core/content/reactHookInteractions';

it('Ref・Effect・Custom Hookの3単元に実操作を必須とし、公開とauthoringの両方で省略・改ざんを拒否する', async () => {
  const { runtime: course, exercises } = await loadAuthoringCourse('content/react');
  expect(course.publicationStatus).toBe('published');
  for (const n of [10, 11, 12]) {
    const id = `react-ch01-l${String(n)}-e01`;
    const exercise = exercises.find((exercise) => exercise.id === id)!;
    const lesson = course.phases[0]!.chapters[0]!.lessons.find((lesson) =>
      lesson.exercises.some((exercise) => exercise.id === id),
    )!;
    const published = lesson.exercises.find((exercise) => exercise.id === id)!;
    const file = `content/react/chapters/react-ch01/lessons/react-ch01-l${String(n)}/exercises/${id}/exercise.yaml`;
    const source = ExerciseSourceSchema.parse(YAML.parse(await readFile(file, 'utf8')));
    expect(ExerciseSourceSchema.safeParse(source).success).toBe(true);
    expect(ExerciseSchema.safeParse(published).success).toBe(true);
    const goal = n === 10 ? 'ref-focus' : n === 11 ? 'external-sync' : 'source-hook';
    expect(exercise.interactionScenarios).toEqual(reactHookScenarios(goal));
    for (const scenarios of [
      undefined,
      [],
      exercise.interactionScenarios!.map((scenario) => ({
        ...scenario,
        actions: scenario.actions.slice(1),
      })),
      reactHookScenarios(n === 10 ? 'external-sync' : 'ref-focus'),
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
      expect(acceptsReactHookScenarios(goal, scenarios)).toBe(false);
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
    profile: 'effect-sync-v1',
    learningGoal: 'external-sync',
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
    ['react-ch01-l10-e01', 'react-ch01-l11-e01', 'react-ch01-l12-e01'].includes(exercise.id),
  )) {
    if (exercise.runtime?.kind !== 'react') throw new Error('React課題が必要です');
    for (const files of [
      exercise.files,
      exercise.solutionFiles,
      ...exercise.fixtures.map((fixture) => fixture.files),
    ]) {
      expect(
        isHookWorkspace(
          Object.fromEntries(files.map((file) => [file.path, file.content])),
          exercise.runtime.profile,
        ),
      ).toBe(true);
    }
    const solution = Object.fromEntries(
      exercise.solutionFiles.map((file) => [file.path, file.content]),
    );
    const analyzed =
      exercise.runtime.learningGoal === 'ref-focus'
        ? analyzeRef(solution['components.tsx']!)
        : analyzeExternalSource(
            solution[
              exercise.runtime.learningGoal === 'source-hook' ? 'sourceHook.ts' : 'components.tsx'
            ]!,
            exercise.runtime.learningGoal === 'source-hook',
          );
    expect(analyzed.diagnostics).toEqual([]);
    expect(Object.values(analyzed.facts).every(Boolean)).toBe(true);
  }
});
