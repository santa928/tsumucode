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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch08/chapter.yaml');
});

describe('html-css-ch08', () => {
  it('Flexbox教材の固定配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch08',
      lessonIds: [
        'html-css-ch08-l01',
        'html-css-ch08-l02',
        'html-css-ch08-l03',
        'html-css-ch08-l04',
        'html-css-ch08-l05',
      ],
      conceptSlideIds: [
        'html-css-ch08-l01-s01',
        'html-css-ch08-l01-s02',
        'html-css-ch08-l02-s01',
        'html-css-ch08-l02-s02',
        'html-css-ch08-l03-s01',
        'html-css-ch08-l03-s02',
        'html-css-ch08-l04-s01',
        'html-css-ch08-l04-s02',
        'html-css-ch08-l05-s01',
        'html-css-ch08-l05-s02',
      ],
      standardExerciseIds: [
        'html-css-ch08-l01-e01',
        'html-css-ch08-l02-e01',
        'html-css-ch08-l03-e01',
        'html-css-ch08-l04-e01',
        'html-css-ch08-l05-e01',
      ],
      estimatedMinutes: 55,
    });
  });

  it('Containerから応用Layoutまでをread→transform／composeへ段階接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch08-l01', {
      beforeExercise: {
        'flex-container': 'read',
        'css-attribute-selector': 'read',
        'flex-direction': 'read',
        'main-cross-axis': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['flex-container', 'flex-direction'],
    });
    expectLessonMastery(loaded, 'html-css-ch08-l02', {
      beforeExercise: { 'justify-content': 'read', gap: 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['justify-content', 'gap'],
    });
    expectLessonMastery(loaded, 'html-css-ch08-l03', {
      beforeExercise: { 'align-items': 'read', 'align-self': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['align-items', 'align-self'],
    });
    expectLessonMastery(loaded, 'html-css-ch08-l04', {
      beforeExercise: { 'flex-wrap': 'read', 'flex-basis': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['flex-wrap', 'flex-basis'],
    });
    expectLessonMastery(loaded, 'html-css-ch08-l05', {
      beforeExercise: { 'flex-navigation': 'read', 'flex-card-row': 'read' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['flex-navigation', 'flex-card-row'],
    });
    await expectChapterConceptCoverage('html-css-ch08', [
      'html-css-ch08-l01',
      'html-css-ch08-l02',
      'html-css-ch08-l03',
      'html-css-ch08-l04',
      'html-css-ch08-l05',
    ]);
  }, 60_000);
});
