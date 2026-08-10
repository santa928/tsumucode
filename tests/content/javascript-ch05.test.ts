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
  'javascript-ch05-l01',
  'javascript-ch05-l02',
  'javascript-ch05-l03',
  'javascript-ch05-l04',
] as const;

/** Chapter 05のAuthoring packageを各testの失敗境界内で読み込む。 */
function loadChapter05(): Promise<LoadedChapterPackage> {
  return loadChapterPackage('content/javascript/chapters/javascript-ch05/chapter.yaml');
}

describe('javascript-ch05', () => {
  it('map・filter・reduce・immutable updateを4 Lesson／16 Slide／4 Exercise／60分で固定する', async () => {
    await assertChapterContract({
      chapterId: 'javascript-ch05',
      lessonIds: LESSON_IDS,
      conceptSlideIds: LESSON_IDS.flatMap((lessonId) => [
        `${lessonId}-s01`,
        `${lessonId}-s02`,
        `${lessonId}-s03`,
        `${lessonId}-s04`,
      ]),
      standardExerciseIds: LESSON_IDS.map((lessonId) => `${lessonId}-e01`),
      estimatedMinutes: 60,
    });
  });

  it('Chapter 04の最後から4 Lessonを15分ずつ順番に接続する', async () => {
    const loaded = await loadChapter05();

    expect(loaded.chapter.sequence).toBe(5);
    expect(loaded.lessons.map(({ estimatedMinutes }) => estimatedMinutes)).toEqual([
      15, 15, 15, 15,
    ]);
    expect(loaded.lessons.map(({ prerequisiteLessonIds }) => prerequisiteLessonIds)).toEqual([
      ['javascript-ch04-l05'],
      ['javascript-ch05-l01'],
      ['javascript-ch05-l02'],
      ['javascript-ch05-l03'],
    ]);
  });

  it('Chapter 06追加後もChapter 05までの進捗Migrationを保持する', async () => {
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
        {
          fromRevision: '2026-08-10.1',
          toRevision: '2026-08-10.2',
          steps: [],
        },
        {
          fromRevision: '2026-08-10.2',
          toRevision: '2026-08-10.3',
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
      'javascript-ch05',
      'javascript-ch06',
    ]);
  }, 20_000);

  it('変換・選別・集計・immutable updateをLessonごとのread→transformへ段階接続する', async () => {
    const loaded = await loadChapter05();

    expectLessonMastery(loaded, 'javascript-ch05-l01', {
      beforeExercise: {
        'map-purpose': 'read',
        'map-callback': 'read',
        'map-result-array': 'read',
        'question-label-map': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-label-map'],
    });
    expectLessonMastery(loaded, 'javascript-ch05-l02', {
      beforeExercise: {
        'filter-purpose': 'read',
        'filter-condition': 'read',
        'filter-result-array': 'read',
        'question-category-filter': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-category-filter'],
    });
    expectLessonMastery(loaded, 'javascript-ch05-l03', {
      beforeExercise: {
        'reduce-purpose': 'read',
        'reduce-accumulator': 'read',
        'reduce-initial-value': 'read',
        'question-score-total': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-score-total'],
    });
    expectLessonMastery(loaded, 'javascript-ch05-l04', {
      beforeExercise: {
        'immutable-update-purpose': 'read',
        'array-map-update': 'read',
        'object-spread-update': 'read',
        'question-answer-state': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['question-answer-state'],
    });
    await expectChapterConceptCoverage('javascript-ch05', LESSON_IDS, 'content/javascript');
  }, 60_000);

  it('各Exerciseを3段階Hint・Solution・5境界Fixture以上・SourceとConsoleのAND判定で固定する', async () => {
    const loaded = await loadChapter05();

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

  it('各Lessonが導入methodとimmutable updateをSource Factで要求する', async () => {
    const loaded = await loadChapter05();
    const factsByExercise = Object.fromEntries(
      loaded.exercises.map((exercise) => [
        exercise.id,
        exercise.validationRules.flatMap((rule) =>
          rule.assertion.kind === 'javascript-source-fact' ? [rule.assertion.fact] : [],
        ),
      ]),
    );

    expect(factsByExercise['javascript-ch05-l01-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'collection-transform',
          method: 'map',
          callbackParameterCount: 1,
        }),
      ]),
    );
    expect(factsByExercise['javascript-ch05-l02-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'collection-transform',
          method: 'filter',
          callbackParameterCount: 1,
        }),
      ]),
    );
    expect(factsByExercise['javascript-ch05-l03-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'collection-transform',
          method: 'reduce',
          callbackParameterCount: 2,
        }),
      ]),
    );
    expect(factsByExercise['javascript-ch05-l04-e01']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'collection-transform',
          method: 'map',
          callbackParameterCount: 1,
        }),
        expect.objectContaining({ kind: 'immutable-update', updateKind: 'array-map' }),
        expect.objectContaining({ kind: 'immutable-update', updateKind: 'object-spread' }),
      ]),
    );
  });
});
