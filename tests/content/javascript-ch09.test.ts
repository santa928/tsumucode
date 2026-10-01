import { beforeAll, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { assertChapterConceptCoverage } from './concept-coverage';

let course: Awaited<ReturnType<typeof loadAuthoringCourse>>;

/** 全Courseの読込は準備で行い、教材契約の検証には既定の実行枠を保つ。 */
beforeAll(async () => {
  course = await loadAuthoringCourse('content/javascript');
}, 30_000);

it('State単元は既習ScopeとDOMを結び、繰り返し操作を採点する', () => {
  const chapter = course.runtime.phases
    .flatMap(({ chapters }) => chapters)
    .find(({ id }) => id === 'javascript-ch09')!;
  assertChapterConceptCoverage(
    {
      missingSlideMetadata: course.missingSlideMetadata,
      missingExerciseMetadata: course.missingExerciseMetadata,
      unmetRequirements: course.masteryDiagnostics,
    },
    'javascript-ch09',
    chapter.lessons.map(({ id }) => id),
    ['javascript-ch09-l01', 'javascript-ch09-l02', 'javascript-ch09-l03', 'javascript-ch09-l04'],
  );
  const exercise = course.exercises.find(({ id }) => id === 'javascript-ch09-l01-e01')!;
  expect(exercise.runtime).toMatchObject({ capabilityProfile: 'dom', primaryOutput: 'preview' });
  expect(
    exercise.interactionScenarios?.[0]?.checkpoints.map(({ expectations }) => expectations[0]),
  ).toEqual(
    [1, 2, 3].map((count) => ({
      id: 'count',
      kind: 'selector-text',
      selector: '#status',
      equals: `読了数: ${String(count)}`,
    })),
  );
  expect(exercise.fixtures.find(({ id }) => id === 'named-handler')?.expectedStatus).toBe('pass');
});
