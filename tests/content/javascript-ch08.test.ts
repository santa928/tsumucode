import { beforeAll, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { assertChapterConceptCoverage } from './concept-coverage';

let authoring: Awaited<ReturnType<typeof loadAuthoringCourse>>;

/** 全Courseの読込は準備で行い、教材契約の検証には既定の実行枠を保つ。 */
beforeAll(async () => {
  authoring = await loadAuthoringCourse('content/javascript');
}, 30_000);

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
