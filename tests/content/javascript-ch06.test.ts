import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import {
  loadChapterPackage,
  type LoadedChapterPackage,
} from '../../scripts/content/loadChapterPackage';
import { expectChapterConceptCoverage } from './concept-coverage';
import { assertChapterContract } from './helpers/assertChapterContract';
import { expectLessonMastery } from './helpers/expectLessonMastery';

const LESSON_IDS = [
  'javascript-ch06-l01',
  'javascript-ch06-l02',
  'javascript-ch06-l03',
  'javascript-ch06-l04',
] as const;

/** Chapter 06のAuthoring packageを各testの失敗境界内で読み込む。 */
function loadChapter06(): Promise<LoadedChapterPackage> {
  return loadChapterPackage('content/javascript/chapters/javascript-ch06/chapter.yaml');
}

describe('javascript-ch06', () => {
  it('Module・Error・Debugを4 Lesson／16 Slide／4 Exercise／70分で固定する', async () => {
    await assertChapterContract({
      chapterId: 'javascript-ch06',
      lessonIds: LESSON_IDS,
      conceptSlideIds: LESSON_IDS.flatMap((lessonId) => [
        `${lessonId}-s01`,
        `${lessonId}-s02`,
        `${lessonId}-s03`,
        `${lessonId}-s04`,
      ]),
      standardExerciseIds: LESSON_IDS.map((lessonId) => `${lessonId}-e01`),
      estimatedMinutes: 70,
    });
  });

  it('Chapter 05の最後から20／15／20／15分で順番に接続する', async () => {
    const loaded = await loadChapter06();

    expect(loaded.chapter.sequence).toBe(6);
    expect(loaded.lessons.map(({ estimatedMinutes }) => estimatedMinutes)).toEqual([
      20, 15, 20, 15,
    ]);
    expect(loaded.lessons.map(({ prerequisiteLessonIds }) => prerequisiteLessonIds)).toEqual([
      ['javascript-ch05-l04'],
      ['javascript-ch06-l01'],
      ['javascript-ch06-l02'],
      ['javascript-ch06-l03'],
    ]);
  });

  it('Data PhaseをChapter 04〜06へ分けCourse累計を27 Lesson／108 Slide／27 Exercise／420分へ更新する', async () => {
    const { runtime: course } = await loadAuthoringCourse(path.resolve('content/javascript'));

    expect(course).toMatchObject({
      revision: '2026-08-10.3',
      estimatedMinutes: 420,
      publicationStatus: 'draft',
      expectedTotals: {
        chapters: 7,
        lessons: 27,
        conceptSlides: 108,
        standardExercises: 27,
        guidedProjectLessons: 0,
        capstoneLessons: 0,
        estimatedMinutes: 420,
      },
    });
    expect(
      course.phases.map(({ id, chapters }) => ({
        id,
        chapterIds: chapters.map(({ id: chapterId }) => chapterId),
      })),
    ).toEqual([
      {
        id: 'javascript-p00-core',
        chapterIds: ['javascript-ch00', 'javascript-ch01', 'javascript-ch02', 'javascript-ch03'],
      },
      {
        id: 'javascript-p01-data',
        chapterIds: ['javascript-ch04', 'javascript-ch05', 'javascript-ch06'],
      },
    ]);
    expect(course.progressMigrations.at(-1)).toEqual({
      fromRevision: '2026-08-10.2',
      toRevision: '2026-08-10.3',
      steps: [],
    });
  }, 20_000);

  it('Module境界・Error処理・DebugをLessonごとのread→transformへ段階接続する', async () => {
    const loaded = await loadChapter06();

    expectLessonMastery(loaded, 'javascript-ch06-l01', {
      beforeExercise: {
        'module-purpose': 'read',
        'named-export': 'read',
        'named-import': 'read',
        'question-data-module': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-data-module'],
    });
    expectLessonMastery(loaded, 'javascript-ch06-l02', {
      beforeExercise: {
        'function-module-purpose': 'read',
        'named-function-export': 'read',
        'relative-function-import': 'read',
        'score-function-module': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['score-function-module'],
    });
    expectLessonMastery(loaded, 'javascript-ch06-l03', {
      beforeExercise: {
        'error-purpose': 'read',
        'throw-error': 'read',
        'try-catch': 'read',
        'question-text-error': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-text-error'],
    });
    expectLessonMastery(loaded, 'javascript-ch06-l04', {
      beforeExercise: {
        'debug-purpose': 'read',
        'expected-actual-value': 'read',
        'diagnostic-location': 'read',
        'score-calculation-debug': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['score-calculation-debug'],
    });
    await expectChapterConceptCoverage('javascript-ch06', LESSON_IDS, 'content/javascript');
  }, 60_000);

  it('Module Lessonを複数editable Fileとmodules profileへ固定する', async () => {
    const loaded = await loadChapter06();
    const [questionModule, scoreModule, errorLesson, debugLesson] = loaded.exercises;

    expect(questionModule?.runtime).toEqual({
      kind: 'javascript',
      entryFile: 'main.js',
      sourceType: 'module',
      capabilityProfile: 'modules',
      primaryOutput: 'console',
    });
    expect(
      questionModule?.files.map(({ path: filePath, editable }) => ({ path: filePath, editable })),
    ).toEqual([
      { path: 'main.js', editable: true },
      { path: 'questions.js', editable: true },
      { path: 'index.html', editable: false },
      { path: 'styles.css', editable: false },
    ]);
    expect(scoreModule?.runtime).toEqual(questionModule?.runtime);
    expect(
      scoreModule?.files.map(({ path: filePath, editable }) => ({ path: filePath, editable })),
    ).toEqual([
      { path: 'main.js', editable: true },
      { path: 'score.js', editable: true },
      { path: 'index.html', editable: false },
      { path: 'styles.css', editable: false },
    ]);
    for (const exercise of [errorLesson, debugLesson]) {
      expect(exercise?.runtime).toEqual({
        kind: 'javascript',
        entryFile: 'script.js',
        sourceType: 'script',
        capabilityProfile: 'core',
        primaryOutput: 'console',
      });
    }
  });

  it('各Exerciseへ3 Hint・Solution・5 Fixture以上と診断code付きcode-errorを持たせる', async () => {
    const loaded = await loadChapter06();

    for (const exercise of loaded.exercises) {
      expect(exercise.solutionFiles).toHaveLength(exercise.files.length);
      expect(exercise.hints.map(({ level }) => level)).toEqual([1, 2, 3]);
      expect(exercise.fixtures.length).toBeGreaterThanOrEqual(5);
      expect(exercise.fixtures.some(({ expectedStatus }) => expectedStatus === 'pass')).toBe(true);
      expect(exercise.fixtures.some(({ expectedStatus }) => expectedStatus === 'incomplete')).toBe(
        true,
      );
      const codeErrors = exercise.fixtures.filter(
        ({ expectedStatus }) => expectedStatus === 'code-error',
      );
      expect(codeErrors.length).toBeGreaterThan(0);
      for (const fixture of codeErrors) {
        expect(
          (fixture as typeof fixture & { expectedDiagnosticCodes?: readonly string[] })
            .expectedDiagnosticCodes,
        ).toEqual(expect.arrayContaining([expect.stringMatching(/^javascript-/u)]));
      }
      const ruleTargetKinds = new Set(exercise.validationRules.map(({ target }) => target.kind));
      expect(ruleTargetKinds.has('javascript-source')).toBe(true);
      expect(ruleTargetKinds.has('javascript-console')).toBe(true);
    }
  });

  it('Module import／export、throw／catch、Debugの掛け算をSource Factで要求する', async () => {
    const loaded = await loadChapter06();
    const factsByExercise = Object.fromEntries(
      loaded.exercises.map((exercise) => [
        exercise.id,
        exercise.validationRules.flatMap((rule) =>
          rule.assertion.kind === 'javascript-source-fact' ? [rule.assertion.fact] : [],
        ),
      ]),
    );

    expect(factsByExercise['javascript-ch06-l01-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'module-boundary',
          boundaryKind: 'import',
          name: 'questions',
        }),
        expect.objectContaining({
          kind: 'module-boundary',
          boundaryKind: 'export',
          name: 'questions',
        }),
      ]),
    );
    expect(factsByExercise['javascript-ch06-l02-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'module-boundary',
          boundaryKind: 'import',
          name: 'scoreAnswer',
        }),
        expect.objectContaining({
          kind: 'module-boundary',
          boundaryKind: 'export',
          name: 'scoreAnswer',
        }),
        expect.objectContaining({ kind: 'call', callee: 'scoreAnswer' }),
      ]),
    );
    expect(factsByExercise['javascript-ch06-l03-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'error-flow', flowKind: 'throw' }),
        expect.objectContaining({ kind: 'error-flow', flowKind: 'catch' }),
      ]),
    );
    expect(factsByExercise['javascript-ch06-l04-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'binary-expression', operator: '*' }),
      ]),
    );
  });
});
