import { beforeAll, expect, it } from 'vitest';
import { loadChapterPackage } from '../../scripts/content/loadChapterPackage';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { assertChapterConceptCoverage } from './concept-coverage';

let loaded: Awaited<ReturnType<typeof loadChapterPackage>>;
let authoring: Awaited<ReturnType<typeof loadAuthoringCourse>>;

/** 全Courseの読込は準備で行い、教材契約の検証には既定の実行枠を保つ。 */
beforeAll(async () => {
  loaded = await loadChapterPackage('content/javascript/chapters/javascript-ch07/chapter.yaml');
  authoring = await loadAuthoringCourse('content/javascript');
}, 30_000);

it('Ch07は4単元で、参照・class・生成接続・複数操作を学ぶ', () => {
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
  // 準備した同じCourseからLesson集合とConcept診断を検証する。
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
