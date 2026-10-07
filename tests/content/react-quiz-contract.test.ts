// @vitest-environment node
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSourceSchema } from '../../scripts/content/sourceSchema';
import { ExerciseSchema } from '../../src/core/content/schema';
import { isQuizWorkspace } from '../../src/adapters/runtime/react/quizScaffold';
import { analyzeQuizSource } from '../../src/adapters/runtime/react/checkQuizSource';
import { reactQuizScenarios } from '../../src/core/content/reactQuizInteractions';

const lessonIds = ['react-ch02-l01', 'react-ch02-l02', 'react-ch03-l01'];
it('Guided2工程の編集責務を共有し、Capstoneの保存/Reset/Progress契約を分ける', async () => {
  const { runtime: course, exercises } = await loadAuthoringCourse('content/react');
  expect(course.publicationStatus).toBe('published');
  const targets = lessonIds.map((lesson) => exercises.find(({ id }) => id === `${lesson}-e01`)!);
  expect(targets.map((item) => item.workspaceId)).toEqual([
    'react-quiz-guided',
    'react-quiz-guided',
    'react-quiz-capstone',
  ]);
  expect(targets.map((item) => (item.kind === 'standard' ? undefined : item.projectId))).toEqual([
    'react-quiz-guided',
    'react-quiz-guided',
    'react-quiz-capstone',
  ]);
  for (const exercise of targets) {
    expect(
      exercise.files
        .filter((file) => file.editable)
        .map((file) => file.path)
        .sort(),
    ).toEqual(['QuestionCard.tsx', 'quizState.ts']);
    expect(exercise.countsTowardStandardExerciseTotal).toBe(false);
    if (exercise.runtime?.kind !== 'react') throw new Error('React契約が必要です');
    expect(
      isQuizWorkspace(
        Object.fromEntries(exercise.files.map((file) => [file.path, file.content])),
        exercise.runtime.profile,
      ),
    ).toBe(true);
    expect(
      isQuizWorkspace(
        Object.fromEntries(exercise.solutionFiles.map((file) => [file.path, file.content])),
        exercise.runtime.profile,
      ),
    ).toBe(true);
    expect(exercise.interactionScenarios).toEqual(
      reactQuizScenarios(exercise.runtime.learningGoal),
    );
  }
  const shared = Object.fromEntries(
    targets[1]!.solutionFiles.map((file) => [file.path, file.content]),
  );
  expect(isQuizWorkspace(shared, 'quiz-workshop-v1')).toBe(true);
  expect(isQuizWorkspace(shared, 'quiz-capstone-v1')).toBe(false);
});
it('全工程の全操作を公開/authoring両Schemaで要求する', async () => {
  const { runtime: course } = await loadAuthoringCourse('content/react');
  for (const lessonId of lessonIds) {
    const chapter = lessonId.includes('ch02') ? 'react-ch02' : 'react-ch03';
    const source = ExerciseSourceSchema.parse(
      YAML.parse(
        await readFile(
          `content/react/chapters/${chapter}/lessons/${lessonId}/exercises/${lessonId}-e01/exercise.yaml`,
          'utf8',
        ),
      ),
    );
    const published = course.phases
      .flatMap((phase) => phase.chapters.flatMap((chapter) => chapter.lessons))
      .find((lesson) => lesson.id === lessonId)!.exercises[0]!;
    expect(ExerciseSchema.safeParse(published).success).toBe(true);
    for (const item of [
      undefined,
      [],
      source.interactionScenarios!.map((scenario) => ({
        ...scenario,
        checkpoints: scenario.checkpoints.slice(1),
      })),
    ]) {
      expect(
        ExerciseSourceSchema.safeParse({ ...source, interactionScenarios: item }).success,
      ).toBe(false);
      expect(ExerciseSchema.safeParse({ ...published, interactionScenarios: item }).success).toBe(
        false,
      );
    }
  }
});
it('実教材の正例・別解を原文で確認し、固定ラベルとGuided丸写しを両Briefで拒否する', async () => {
  const { exercises } = await loadAuthoringCourse('content/react');
  for (const lesson of lessonIds) {
    const exercise = exercises.find((item) => item.id === `${lesson}-e01`)!;
    const practice =
      exercise.runtime?.kind === 'react' && exercise.runtime.profile === 'quiz-capstone-v1';
    for (const fixture of exercise.fixtures.filter((item) =>
      ['solution', 'alternative', 'alias'].includes(item.id),
    )) {
      const result = analyzeQuizSource(
        Object.fromEntries(fixture.files.map((file) => [file.path, file.content])),
        practice,
      );
      expect(result.diagnostics).toEqual([]);
      expect(
        result.facts.rendersQuestion &&
          result.facts.usesStableChoiceKeys &&
          result.facts.forwardsSelectedChoice,
      ).toBe(true);
      if (!lesson.endsWith('ch02-l01'))
        expect(Object.values(result.facts).every(Boolean)).toBe(true);
    }
    const bad = exercise.fixtures.find((item) => item.id === 'fixed-label')!;
    const negative = analyzeQuizSource(
      Object.fromEntries(bad.files.map((file) => [file.path, file.content])),
      practice,
    );
    expect(negative.diagnostics).toEqual([]);
    expect(negative.facts.rendersQuestion).toBe(false);
    expect(negative.facts.usesStableChoiceKeys).toBe(true);
    expect(negative.facts.forwardsSelectedChoice).toBe(true);
    if (practice) {
      const copy = exercise.fixtures.find((item) => item.id === 'guided-copy')!;
      expect(
        analyzeQuizSource(
          Object.fromEntries(copy.files.map((file) => [file.path, file.content])),
          true,
        ).facts.scoresActualAnswer,
      ).toBe(false);
    }
  }
});
