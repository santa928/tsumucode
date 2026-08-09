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
  'javascript-ch04-l01',
  'javascript-ch04-l02',
  'javascript-ch04-l03',
  'javascript-ch04-l04',
  'javascript-ch04-l05',
] as const;

const LESSON_MINUTES = [15, 15, 15, 15, 20] as const;

/** Chapter 04のAuthoring packageを各testの失敗境界内で読み込む。 */
function loadChapter04(): Promise<LoadedChapterPackage> {
  return loadChapterPackage('content/javascript/chapters/javascript-ch04/chapter.yaml');
}

describe('javascript-ch04', () => {
  it('Array・Object・Destructuringを5 Lesson／20 Slide／5 Exercise／80分で固定する', async () => {
    await assertChapterContract({
      chapterId: 'javascript-ch04',
      lessonIds: LESSON_IDS,
      conceptSlideIds: LESSON_IDS.flatMap((lessonId) => [
        `${lessonId}-s01`,
        `${lessonId}-s02`,
        `${lessonId}-s03`,
        `${lessonId}-s04`,
      ]),
      standardExerciseIds: LESSON_IDS.map((lessonId) => `${lessonId}-e01`),
      estimatedMinutes: 80,
    });
  });

  it('Chapter 03の最後から5 Lessonを順番に接続する', async () => {
    const loaded = await loadChapter04();

    expect(loaded.chapter.sequence).toBe(4);
    expect(loaded.lessons.map(({ estimatedMinutes }) => estimatedMinutes)).toEqual(LESSON_MINUTES);
    expect(loaded.lessons.map(({ prerequisiteLessonIds }) => prerequisiteLessonIds)).toEqual([
      ['javascript-ch03-l05'],
      ['javascript-ch04-l01'],
      ['javascript-ch04-l02'],
      ['javascript-ch04-l03'],
      ['javascript-ch04-l04'],
    ]);
  });

  it('Course累計を19 Lesson／76 Slide／19 Exercise／290分へ更新し既存進捗を保持する', async () => {
    const { runtime: course } = await loadAuthoringCourse(path.resolve('content/javascript'));

    expect(course).toMatchObject({
      revision: '2026-08-10.1',
      estimatedMinutes: 290,
      publicationStatus: 'draft',
      expectedTotals: {
        chapters: 5,
        lessons: 19,
        conceptSlides: 76,
        standardExercises: 19,
        guidedProjectLessons: 0,
        capstoneLessons: 0,
        estimatedMinutes: 290,
      },
      progressMigrations: [
        {
          fromRevision: '2026-08-02.1',
          toRevision: '2026-08-09.1',
          steps: [],
        },
        {
          fromRevision: '2026-08-09.1',
          toRevision: '2026-08-10.1',
          steps: [],
        },
      ],
    });
    expect(course.phases.flatMap(({ chapters }) => chapters).map(({ id }) => id)).toEqual([
      'javascript-ch00',
      'javascript-ch01',
      'javascript-ch02',
      'javascript-ch03',
      'javascript-ch04',
    ]);
  }, 20_000);

  it('ArrayからDestructuringまでをLessonごとのread→transformへ段階接続する', async () => {
    const loaded = await loadChapter04();

    expectLessonMastery(loaded, 'javascript-ch04-l01', {
      beforeExercise: {
        'array-purpose': 'read',
        'array-literal': 'read',
        'array-length': 'read',
        'question-array': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-array'],
    });
    expectLessonMastery(loaded, 'javascript-ch04-l02', {
      beforeExercise: {
        'zero-based-index': 'read',
        'bracket-access': 'read',
        'array-at-method': 'read',
        'question-order-access': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-order-access'],
    });
    expectLessonMastery(loaded, 'javascript-ch04-l03', {
      beforeExercise: {
        'for-of-purpose': 'read',
        'for-of-statement': 'read',
        'for-of-item': 'read',
        'question-list-loop': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-list-loop'],
    });
    expectLessonMastery(loaded, 'javascript-ch04-l04', {
      beforeExercise: {
        'object-purpose': 'read',
        'object-literal': 'read',
        'property-access': 'read',
        'question-object': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-object'],
    });
    expectLessonMastery(loaded, 'javascript-ch04-l05', {
      beforeExercise: {
        'destructuring-purpose': 'read',
        'object-destructuring': 'read',
        'array-destructuring': 'read',
        'question-destructuring': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-destructuring'],
    });
    await expectChapterConceptCoverage('javascript-ch04', LESSON_IDS, 'content/javascript');
  }, 60_000);

  it('各Exerciseを3段階Hint・Solution・5境界Fixture以上・SourceとConsoleのAND判定で固定する', async () => {
    const loaded = await loadChapter04();

    for (const exercise of loaded.exercises) {
      expect(
        exercise.files.map(({ path: filePath, editable }) => ({ path: filePath, editable })),
      ).toEqual([
        { path: 'script.js', editable: true },
        { path: 'index.html', editable: false },
        { path: 'styles.css', editable: false },
      ]);
      expect(exercise.solutionFiles).toHaveLength(3);
      expect(exercise.hints.map(({ level }) => level)).toEqual([1, 2, 3]);
      expect(exercise.fixtures.length).toBeGreaterThanOrEqual(5);
      expect(exercise.fixtures.some(({ expectedStatus }) => expectedStatus === 'pass')).toBe(true);
      expect(exercise.fixtures.some(({ expectedStatus }) => expectedStatus === 'incomplete')).toBe(
        true,
      );
      expect(exercise.fixtures.some(({ expectedStatus }) => expectedStatus === 'code-error')).toBe(
        true,
      );
      const ruleTargetKinds = new Set(exercise.validationRules.map(({ target }) => target.kind));
      expect(ruleTargetKinds.has('javascript-source')).toBe(true);
      expect(ruleTargetKinds.has('javascript-console')).toBe(true);
    }
  });

  it('各Lessonが導入構文をSource Factで要求する', async () => {
    const loaded = await loadChapter04();
    const factsByExercise = Object.fromEntries(
      loaded.exercises.map((exercise) => [
        exercise.id,
        exercise.validationRules.flatMap((rule) =>
          rule.assertion.kind === 'javascript-source-fact' ? [rule.assertion.fact] : [],
        ),
      ]),
    );

    expect(factsByExercise['javascript-ch04-l01-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'collection', collectionKind: 'array', entryCount: 3 }),
      ]),
    );
    expect(factsByExercise['javascript-ch04-l02-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'collection-access', accessKind: 'index' }),
        expect.objectContaining({ kind: 'collection-access', accessKind: 'at' }),
      ]),
    );
    expect(factsByExercise['javascript-ch04-l03-e01']).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'loop', loopKind: 'for-of' })]),
    );
    expect(factsByExercise['javascript-ch04-l04-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'collection', collectionKind: 'object', entryCount: 2 }),
        expect.objectContaining({ kind: 'collection-access', accessKind: 'property' }),
      ]),
    );
    expect(factsByExercise['javascript-ch04-l05-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'destructuring', patternKind: 'object', bindingCount: 2 }),
        expect.objectContaining({ kind: 'destructuring', patternKind: 'array', bindingCount: 1 }),
      ]),
    );
  });
});
