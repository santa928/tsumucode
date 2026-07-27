import { beforeAll, describe, it } from 'vitest';
import {
  loadChapterPackage,
  type LoadedChapterPackage,
} from '../../scripts/content/loadChapterPackage';
import { expectChapterConceptCoverage } from './concept-coverage';
import { assertChapterContract } from './helpers/assertChapterContract';
import { expectLessonMastery } from './helpers/expectLessonMastery';

let loaded: LoadedChapterPackage;

beforeAll(async () => {
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch04/chapter.yaml');
});

describe('html-css-ch04', () => {
  it('CSSとCascade教材の固定IDと配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch04',
      lessonIds: [
        'html-css-ch04-l01',
        'html-css-ch04-l02',
        'html-css-ch04-l03',
        'html-css-ch04-l04',
      ],
      conceptSlideIds: [
        'html-css-ch04-l01-s01',
        'html-css-ch04-l01-s02',
        'html-css-ch04-l01-s03',
        'html-css-ch04-l02-s01',
        'html-css-ch04-l02-s02',
        'html-css-ch04-l03-s01',
        'html-css-ch04-l03-s02',
        'html-css-ch04-l03-s03',
        'html-css-ch04-l04-s01',
        'html-css-ch04-l04-s02',
      ],
      standardExerciseIds: [
        'html-css-ch04-l01-e01',
        'html-css-ch04-l02-e01',
        'html-css-ch04-l03-e01',
        'html-css-ch04-l04-e01',
      ],
      estimatedMinutes: 50,
    });
  });

  it('CSS RuleからComputed Valueまでをread→transformへ段階接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch04-l01', {
      beforeExercise: {
        'css-rule': 'read',
        declaration: 'read',
        'type-selector': 'read',
        'class-selector': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['type-selector', 'class-selector'],
    });
    expectLessonMastery(loaded, 'html-css-ch04-l02', {
      beforeExercise: {
        'stylesheet-link': 'read',
        'css-property-value': 'read',
        'colon-semicolon': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['stylesheet-link', 'css-property-value'],
    });
    expectLessonMastery(loaded, 'html-css-ch04-l03', {
      beforeExercise: {
        'cascade-source-order': 'read',
        specificity: 'read',
        inheritance: 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['cascade-source-order', 'inheritance'],
    });
    expectLessonMastery(loaded, 'html-css-ch04-l04', {
      beforeExercise: {
        'css-px': 'read',
        'css-rem': 'read',
        'computed-value': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['css-rem', 'computed-value'],
    });
    await expectChapterConceptCoverage('html-css-ch04', [
      'html-css-ch04-l01',
      'html-css-ch04-l02',
      'html-css-ch04-l03',
      'html-css-ch04-l04',
    ]);
  }, 60_000);
});
