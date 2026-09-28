import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { assertChapterConceptCoverage } from './concept-coverage';

it('Ch08先頭は既習FunctionとDOMから操作前後を実Scenarioへ接続する', async () => {
  const authoring = await loadAuthoringCourse('content/javascript');
  const chapter = authoring.runtime.phases
    .flatMap(({ chapters }) => chapters)
    .find(({ id }) => id === 'javascript-ch08')!;
  expect(chapter.lessons.map(({ id }) => id)).toEqual([
    'javascript-ch08-l01',
    'javascript-ch08-l02',
  ]);
  assertChapterConceptCoverage(
    {
      missingSlideMetadata: authoring.missingSlideMetadata,
      missingExerciseMetadata: authoring.missingExerciseMetadata,
      unmetRequirements: authoring.masteryDiagnostics,
    },
    'javascript-ch08',
    ['javascript-ch08-l01', 'javascript-ch08-l02'],
    ['javascript-ch08-l01', 'javascript-ch08-l02'],
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
  expect(input.fixtures.find(({ id }) => id === 'change-only')?.expectedStatus).toBe('incomplete');
});
