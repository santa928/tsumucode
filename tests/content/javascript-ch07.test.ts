import { expect, it } from 'vitest';
import { loadChapterPackage } from '../../scripts/content/loadChapterPackage';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { assertChapterConceptCoverage } from './concept-coverage';

it('Ch07は先頭2単元で、参照とclass状態から編集へ接続する', async () => {
  const loaded = await loadChapterPackage(
    'content/javascript/chapters/javascript-ch07/chapter.yaml',
  );
  expect(loaded.lessons.map(({ id }) => id)).toEqual([
    'javascript-ch07-l01',
    'javascript-ch07-l02',
  ]);
  expect(loaded.lessons[0]?.prerequisiteLessonIds).toEqual([
    'javascript-ch01-l02',
    'javascript-ch02-l02',
  ]);
  const exercise = loaded.exercises[0]!;
  expect(exercise.runtime).toMatchObject({ capabilityProfile: 'dom', primaryOutput: 'preview' });
  expect(exercise.files.filter((file) => file.editable).map((file) => file.path)).toEqual([
    'script.js',
  ]);
  expect(
    exercise.validationRules.some(
      (rule) => rule.assertion.kind === 'query-selector-text-content-assignment',
    ),
  ).toBe(false);
  expect(
    exercise.fixtures
      .filter((fixture) => fixture.expectedStatus === 'pass')
      .map((fixture) => fixture.id),
  ).toEqual(['alternate-name', 'no-if']);
  // Courseの読込を共有し、Lesson集合とConcept診断を同じ結果から検証する。
  const authoring = await loadAuthoringCourse('content/javascript');
  const chapter = authoring.runtime.phases
    .flatMap(({ chapters }) => chapters)
    .find(({ id }) => id === 'javascript-ch07');
  expect(chapter).toBeDefined();
  assertChapterConceptCoverage(
    {
      missingSlideMetadata: authoring.missingSlideMetadata,
      missingExerciseMetadata: authoring.missingExerciseMetadata,
      unmetRequirements: authoring.masteryDiagnostics,
    },
    'javascript-ch07',
    chapter!.lessons.map(({ id }) => id),
    ['javascript-ch07-l01', 'javascript-ch07-l02'],
  );
});
