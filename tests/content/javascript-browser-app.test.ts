import { beforeAll, expect, it } from 'vitest';
import {
  loadAuthoringCourse,
  type AuthoringCoursePackage,
} from '../../scripts/content/compileCourse';
import { assertChapterConceptCoverage } from './concept-coverage';

let authoring: AuthoringCoursePackage;
/** 教材の読込を共有する準備には30秒、各章の契約検証には既定の実行枠を保つ。 */
beforeAll(async () => {
  authoring = await loadAuthoringCourse('content/javascript');
}, 30_000);

it('Ch07は4単元で、参照・class・生成接続・複数操作を学ぶ', () => {
  const loaded = {
    lessons: authoring.runtime.phases
      .flatMap(({ chapters }) => chapters)
      .find(({ id }) => id === 'javascript-ch07')!.lessons,
    exercises: authoring.exercises.filter(({ id }) => id.startsWith('javascript-ch07-')),
  };
  expect(loaded.lessons.map(({ id }) => id)).toEqual([
    'javascript-ch07-l01',
    'javascript-ch07-l02',
    'javascript-ch07-l03',
    'javascript-ch07-l04',
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
    ['javascript-ch07-l01', 'javascript-ch07-l02', 'javascript-ch07-l03', 'javascript-ch07-l04'],
  );
});

it('Ch08先頭は既習FunctionとDOMから操作前後を実Scenarioへ接続する', () => {
  const chapter = authoring.runtime.phases
    .flatMap(({ chapters }) => chapters)
    .find(({ id }) => id === 'javascript-ch08')!;
  expect(chapter.lessons.map(({ id }) => id)).toEqual([
    'javascript-ch08-l01',
    'javascript-ch08-l02',
    'javascript-ch08-l03',
    'javascript-ch08-l04',
  ]);
  assertChapterConceptCoverage(
    {
      missingSlideMetadata: authoring.missingSlideMetadata,
      missingExerciseMetadata: authoring.missingExerciseMetadata,
      unmetRequirements: authoring.masteryDiagnostics,
    },
    'javascript-ch08',
    ['javascript-ch08-l01', 'javascript-ch08-l02', 'javascript-ch08-l03', 'javascript-ch08-l04'],
    ['javascript-ch08-l01', 'javascript-ch08-l02', 'javascript-ch08-l03', 'javascript-ch08-l04'],
  );
  const exercise = authoring.exercises.find(({ id }) => id === 'javascript-ch08-l01-e01')!;
  expect(exercise.runtime).toMatchObject({ capabilityProfile: 'dom', primaryOutput: 'preview' });
  expect(exercise.files.filter(({ editable }) => editable).map(({ path }) => path)).toEqual([
    'script.js',
  ]);
  expect(exercise.interactionScenarios?.[0]?.actions).toEqual([
    { id: 'open', kind: 'click', selector: '#open' },
  ]);
  expect(
    exercise.fixtures.some(
      ({ id, expectedStatus }) => id === 'named-handler' && expectedStatus === 'pass',
    ),
  ).toBe(true);
  const input = authoring.exercises.find(({ id }) => id === 'javascript-ch08-l02-e01')!;
  expect(input.interactionScenarios?.[0]?.actions.map(({ kind }) => kind)).toEqual([
    'fill',
    'fill',
    'fill',
  ]);
  const form = authoring.exercises.find(({ id }) => id === 'javascript-ch08-l03-e01')!;
  expect(form.runtime).toMatchObject({ capabilityProfile: 'dom-form' });
  expect(
    form.interactionScenarios?.[0]?.checkpoints
      .flatMap(({ expectations }) => expectations)
      .filter(({ kind }) => kind === 'submit-prevented'),
  ).toHaveLength(2);
  expect(input.fixtures.find(({ id }) => id === 'change-only')?.expectedStatus).toBe('incomplete');
});

it('State単元は既習ScopeとDOMを結び、繰り返し操作を採点する', () => {
  const course = authoring;
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
