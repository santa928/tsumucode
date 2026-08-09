import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadChapterPackage,
  type LoadedChapterPackage,
} from '../../scripts/content/loadChapterPackage';
import { expectChapterConceptCoverage } from './concept-coverage';
import { assertChapterContract } from './helpers/assertChapterContract';
import { expectLessonMastery } from './helpers/expectLessonMastery';

let loaded: LoadedChapterPackage;

beforeAll(async () => {
  loaded = await loadChapterPackage('content/javascript/chapters/javascript-ch02/chapter.yaml');
});

describe('javascript-ch02', () => {
  it('条件分岐とLoopを4 Lesson／16 Slide／4 Exercise／60分で固定する', async () => {
    await assertChapterContract({
      chapterId: 'javascript-ch02',
      lessonIds: [
        'javascript-ch02-l01',
        'javascript-ch02-l02',
        'javascript-ch02-l03',
        'javascript-ch02-l04',
      ],
      conceptSlideIds: [
        'javascript-ch02-l01-s01',
        'javascript-ch02-l01-s02',
        'javascript-ch02-l01-s03',
        'javascript-ch02-l01-s04',
        'javascript-ch02-l02-s01',
        'javascript-ch02-l02-s02',
        'javascript-ch02-l02-s03',
        'javascript-ch02-l02-s04',
        'javascript-ch02-l03-s01',
        'javascript-ch02-l03-s02',
        'javascript-ch02-l03-s03',
        'javascript-ch02-l03-s04',
        'javascript-ch02-l04-s01',
        'javascript-ch02-l04-s02',
        'javascript-ch02-l04-s03',
        'javascript-ch02-l04-s04',
      ],
      standardExerciseIds: [
        'javascript-ch02-l01-e01',
        'javascript-ch02-l02-e01',
        'javascript-ch02-l03-e01',
        'javascript-ch02-l04-e01',
      ],
      estimatedMinutes: 60,
    });
  });

  it('Chapter 01の最後から4 Lessonを順番に接続する', () => {
    expect(loaded.chapter.sequence).toBe(2);
    expect(loaded.lessons.map(({ prerequisiteLessonIds }) => prerequisiteLessonIds)).toEqual([
      ['javascript-ch01-l04'],
      ['javascript-ch02-l01'],
      ['javascript-ch02-l02'],
      ['javascript-ch02-l03'],
    ]);
  });

  it('各Lessonを4 Slideから1 Exerciseへ接続する', () => {
    for (const lesson of loaded.lessons) {
      expect(lesson.slideSources, `${lesson.id}: Slide数`).toHaveLength(4);
      expect(lesson.exerciseSources, `${lesson.id}: Exercise数`).toHaveLength(1);
    }
  });

  it('比較からforまでをLessonごとのread→transformへ段階接続する', async () => {
    expectLessonMastery(loaded, 'javascript-ch02-l01', {
      beforeExercise: {
        'comparison-expression': 'read',
        'strict-equality': 'read',
        'strict-inequality': 'read',
        'boolean-comparison': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['boolean-comparison'],
    });
    expectLessonMastery(loaded, 'javascript-ch02-l02', {
      beforeExercise: {
        'conditional-branch': 'read',
        'if-statement': 'read',
        'else-branch': 'read',
        'if-else-output': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['if-else-output'],
    });
    expectLessonMastery(loaded, 'javascript-ch02-l03', {
      beforeExercise: {
        'multiple-branches': 'read',
        'else-if-branch': 'read',
        'branch-order': 'read',
        'three-way-classification': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['three-way-classification'],
    });
    expectLessonMastery(loaded, 'javascript-ch02-l04', {
      beforeExercise: {
        'counted-loop': 'read',
        'for-statement': 'read',
        'increment-operator': 'read',
        'problem-number-loop': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['problem-number-loop'],
    });
    await expectChapterConceptCoverage(
      'javascript-ch02',
      ['javascript-ch02-l01', 'javascript-ch02-l02', 'javascript-ch02-l03', 'javascript-ch02-l04'],
      'content/javascript',
    );
  }, 60_000);

  it('各Exerciseを3段階Hint・Solution・5境界Fixture以上・SourceとConsoleのAND判定で固定する', () => {
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
      expect(exercise.validationRules.every(({ group }) => group === 'all')).toBe(true);
    }
  });
});
