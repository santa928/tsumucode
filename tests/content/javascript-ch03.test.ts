import { describe, expect, it } from 'vitest';
import {
  loadChapterPackage,
  type LoadedChapterPackage,
} from '../../scripts/content/loadChapterPackage';
import { expectChapterConceptCoverage } from './concept-coverage';
import { assertChapterContract } from './helpers/assertChapterContract';
import { expectLessonMastery } from './helpers/expectLessonMastery';

const LESSON_IDS = [
  'javascript-ch03-l01',
  'javascript-ch03-l02',
  'javascript-ch03-l03',
  'javascript-ch03-l04',
  'javascript-ch03-l05',
] as const;

/** Chapter 03のAuthoring packageを各testの失敗境界内で読み込む。 */
function loadChapter03(): Promise<LoadedChapterPackage> {
  return loadChapterPackage('content/javascript/chapters/javascript-ch03/chapter.yaml');
}

describe('javascript-ch03', () => {
  it('Function・Scope・Closureを5 Lesson／20 Slide／5 Exercise／75分で固定する', async () => {
    await assertChapterContract({
      chapterId: 'javascript-ch03',
      lessonIds: LESSON_IDS,
      conceptSlideIds: LESSON_IDS.flatMap((lessonId) => [
        `${lessonId}-s01`,
        `${lessonId}-s02`,
        `${lessonId}-s03`,
        `${lessonId}-s04`,
      ]),
      standardExerciseIds: LESSON_IDS.map((lessonId) => `${lessonId}-e01`),
      estimatedMinutes: 75,
    });
  });

  it('Chapter 02の最後から5 Lessonを順番に接続する', async () => {
    const loaded = await loadChapter03();

    expect(loaded.chapter.sequence).toBe(3);
    expect(loaded.lessons.map(({ prerequisiteLessonIds }) => prerequisiteLessonIds)).toEqual([
      ['javascript-ch02-l04'],
      ['javascript-ch03-l01'],
      ['javascript-ch03-l02'],
      ['javascript-ch03-l03'],
      ['javascript-ch03-l04'],
    ]);
  });

  it('各Lessonを4 Slideから1 Exerciseへ接続する', async () => {
    const loaded = await loadChapter03();

    for (const lesson of loaded.lessons) {
      expect(lesson.slideSources, `${lesson.id}: Slide数`).toHaveLength(4);
      expect(lesson.exerciseSources, `${lesson.id}: Exercise数`).toHaveLength(1);
    }
  });

  it('Function宣言からClosureまでをLessonごとのread→transformへ段階接続する', async () => {
    const loaded = await loadChapter03();

    expectLessonMastery(loaded, 'javascript-ch03-l01', {
      beforeExercise: {
        'function-purpose': 'read',
        'function-declaration': 'read',
        'function-call': 'read',
        'show-question-function': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['show-question-function'],
    });
    expectLessonMastery(loaded, 'javascript-ch03-l02', {
      beforeExercise: {
        'function-input-output': 'read',
        'function-parameter': 'read',
        'return-value': 'read',
        'score-function': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['score-function'],
    });
    expectLessonMastery(loaded, 'javascript-ch03-l03', {
      beforeExercise: {
        'variable-scope': 'read',
        'global-scope': 'read',
        'local-scope': 'read',
        'scoped-labels': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['scoped-labels'],
    });
    expectLessonMastery(loaded, 'javascript-ch03-l04', {
      beforeExercise: {
        'arrow-function': 'read',
        'arrow-parameter': 'read',
        'arrow-return': 'read',
        'answer-format-function': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['answer-format-function'],
    });
    expectLessonMastery(loaded, 'javascript-ch03-l05', {
      beforeExercise: {
        'closure-memory': 'read',
        'outer-inner-function': 'read',
        'captured-binding': 'read',
        'score-closure': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['score-closure'],
    });
    await expectChapterConceptCoverage('javascript-ch03', LESSON_IDS, 'content/javascript');
  }, 60_000);

  it('各Exerciseを3段階Hint・Solution・5境界Fixture以上・SourceとConsoleのAND判定で固定する', async () => {
    const loaded = await loadChapter03();

    for (const exercise of loaded.exercises) {
      expect(exercise.files.map(({ path, editable }) => ({ path, editable }))).toEqual([
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

    const closureExercise = loaded.exercises.find(({ id }) => id === 'javascript-ch03-l05-e01');
    expect(closureExercise).toBeDefined();
    expect(
      closureExercise?.validationRules.filter(
        ({ groupId, group }) =>
          groupId === 'javascript-ch03-l05-e01-function-form' && group === 'any',
      ),
    ).toHaveLength(2);
  });
});
