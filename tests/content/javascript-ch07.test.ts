import { expect, it } from 'vitest';
import { loadChapterPackage } from '../../scripts/content/loadChapterPackage';
import { expectChapterConceptCoverage } from './concept-coverage';

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
  await expectChapterConceptCoverage(
    'javascript-ch07',
    ['javascript-ch07-l01', 'javascript-ch07-l02'],
    'content/javascript',
  );
});
