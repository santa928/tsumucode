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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch06/chapter.yaml');
});

describe('html-css-ch06', () => {
  it('文字と色の固定教材数を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch06',
      lessonIds: [
        'html-css-ch06-l01',
        'html-css-ch06-l02',
        'html-css-ch06-l03',
        'html-css-ch06-l04',
      ],
      conceptSlideIds: [
        'html-css-ch06-l01-s01',
        'html-css-ch06-l01-s02',
        'html-css-ch06-l02-s01',
        'html-css-ch06-l02-s02',
        'html-css-ch06-l03-s01',
        'html-css-ch06-l03-s02',
        'html-css-ch06-l04-s01',
        'html-css-ch06-l04-s02',
      ],
      standardExerciseIds: [
        'html-css-ch06-l01-e01',
        'html-css-ch06-l02-e01',
        'html-css-ch06-l03-e01',
        'html-css-ch06-l04-e01',
      ],
      estimatedMinutes: 45,
    });
  });

  it('Typographyから再利用Classまでをread→transform／composeへ段階接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch06-l01', {
      beforeExercise: {
        'font-size': 'read',
        'line-height': 'read',
        'font-family-system': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['font-size', 'line-height'],
    });
    expectLessonMastery(loaded, 'html-css-ch06-l02', {
      beforeExercise: {
        'color-background-color': 'read',
        'contrast-ratio': 'read',
        'non-color-cue': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['color-background-color', 'non-color-cue'],
    });
    expectLessonMastery(loaded, 'html-css-ch06-l03', {
      beforeExercise: { 'custom-property-root': 'read', 'var-function': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['custom-property-root', 'var-function'],
    });
    expectLessonMastery(loaded, 'html-css-ch06-l04', {
      beforeExercise: { 'reusable-base-class': 'read', 'modifier-class': 'read' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['reusable-base-class', 'modifier-class'],
    });
    await expectChapterConceptCoverage('html-css-ch06', [
      'html-css-ch06-l01',
      'html-css-ch06-l02',
      'html-css-ch06-l03',
      'html-css-ch06-l04',
    ]);
  }, 60_000);
});
