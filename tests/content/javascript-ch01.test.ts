import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadChapterPackage,
  type LoadedChapterPackage,
} from '../../scripts/content/loadChapterPackage';
import { assertChapterContract } from './helpers/assertChapterContract';
import { expectChapterConceptCoverage } from './concept-coverage';
import { expectLessonMastery } from './helpers/expectLessonMastery';

let loaded: LoadedChapterPackage;

beforeAll(async () => {
  loaded = await loadChapterPackage('content/javascript/chapters/javascript-ch01/chapter.yaml');
});

describe('javascript-ch01', () => {
  it('値・変数・型・演算を4 Lesson／16 Slide／4 Exercise／60分で固定する', async () => {
    await assertChapterContract({
      chapterId: 'javascript-ch01',
      lessonIds: [
        'javascript-ch01-l01',
        'javascript-ch01-l02',
        'javascript-ch01-l03',
        'javascript-ch01-l04',
      ],
      conceptSlideIds: [
        'javascript-ch01-l01-s01',
        'javascript-ch01-l01-s02',
        'javascript-ch01-l01-s03',
        'javascript-ch01-l01-s04',
        'javascript-ch01-l02-s01',
        'javascript-ch01-l02-s02',
        'javascript-ch01-l02-s03',
        'javascript-ch01-l02-s04',
        'javascript-ch01-l03-s01',
        'javascript-ch01-l03-s02',
        'javascript-ch01-l03-s03',
        'javascript-ch01-l03-s04',
        'javascript-ch01-l04-s01',
        'javascript-ch01-l04-s02',
        'javascript-ch01-l04-s03',
        'javascript-ch01-l04-s04',
      ],
      standardExerciseIds: [
        'javascript-ch01-l01-e01',
        'javascript-ch01-l02-e01',
        'javascript-ch01-l03-e01',
        'javascript-ch01-l04-e01',
      ],
      estimatedMinutes: 60,
    });
  });

  it('各Lessonを4 Slideから1 Exerciseへ接続する', () => {
    for (const lesson of loaded.lessons) {
      if (lesson.id.startsWith('javascript-ch01-l')) {
        if (lesson.slideSources.length !== 4 || lesson.exerciseSources.length !== 1) {
          throw new Error(`${lesson.id}は4 Slide／1 Exerciseである必要があります`);
        }
      }
    }
  });

  it('値からlet更新までをLessonごとのread→transformへ段階接続する', async () => {
    expectLessonMastery(loaded, 'javascript-ch01-l01', {
      beforeExercise: {
        'javascript-value': 'read',
        'javascript-primitive-types': 'read',
        'console-log': 'read',
        'console-log-values': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['console-log-values'],
    });
    expectLessonMastery(loaded, 'javascript-ch01-l02', {
      beforeExercise: {
        'javascript-variable': 'read',
        'const-binding': 'read',
        'identifier-reference': 'read',
        'const-console-output': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['const-console-output'],
    });
    expectLessonMastery(loaded, 'javascript-ch01-l03', {
      beforeExercise: {
        'arithmetic-expression': 'read',
        'operator-precedence': 'read',
        'calculated-binding': 'read',
        'score-calculation': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['score-calculation'],
    });
    expectLessonMastery(loaded, 'javascript-ch01-l04', {
      beforeExercise: {
        'mutable-value': 'read',
        'let-binding': 'read',
        'addition-assignment': 'read',
        'let-score-update': 'transform',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['let-score-update'],
    });
    await expectChapterConceptCoverage(
      'javascript-ch01',
      ['javascript-ch01-l01', 'javascript-ch01-l02', 'javascript-ch01-l03', 'javascript-ch01-l04'],
      'content/javascript',
    );
  }, 60_000);

  it('各Exerciseを3段階Hint・Solution・5境界Fixture・SourceとConsoleのAND判定で固定する', () => {
    const expectedConceptFixtureFeedback = new Map([
      [
        'javascript-ch01-l01-e01',
        [
          'javascript-ch01-l01-e01-r01',
          'javascript-ch01-l01-e01-r02',
          'javascript-ch01-l01-e01-r03',
          'javascript-ch01-l01-e01-r04',
          'javascript-ch01-l01-e01-r05',
        ],
      ],
      [
        'javascript-ch01-l02-e01',
        [
          'javascript-ch01-l02-e01-r01',
          'javascript-ch01-l02-e01-r02',
          'javascript-ch01-l02-e01-r03',
        ],
      ],
      [
        'javascript-ch01-l03-e01',
        [
          'javascript-ch01-l03-e01-r01',
          'javascript-ch01-l03-e01-r02',
          'javascript-ch01-l03-e01-r03',
        ],
      ],
      [
        'javascript-ch01-l04-e01',
        [
          'javascript-ch01-l04-e01-r01',
          'javascript-ch01-l04-e01-r02',
          'javascript-ch01-l04-e01-r03',
        ],
      ],
    ]);

    for (const exercise of loaded.exercises) {
      expect(exercise.files.map(({ path, editable }) => ({ path, editable }))).toEqual([
        { path: 'script.js', editable: true },
        { path: 'index.html', editable: false },
        { path: 'styles.css', editable: false },
      ]);
      expect(exercise.solutionFiles).toHaveLength(3);
      expect(exercise.hints.map(({ level }) => level)).toEqual([1, 2, 3]);
      expect(exercise.fixtures).toHaveLength(5);
      expect(exercise.fixtures.map(({ expectedStatus }) => expectedStatus)).toEqual([
        'pass',
        'incomplete',
        'incomplete',
        'code-error',
        'code-error',
      ]);
      const ruleTargetKinds = new Set(exercise.validationRules.map(({ target }) => target.kind));
      expect(ruleTargetKinds.has('javascript-source')).toBe(true);
      expect(ruleTargetKinds.has('javascript-console')).toBe(true);
      expect(exercise.validationRules.every(({ group }) => group === 'all')).toBe(true);
      expect(exercise.fixtures[2]?.expectedFeedbackRuleIds).toEqual(
        expectedConceptFixtureFeedback.get(exercise.id),
      );
    }
  });
});
