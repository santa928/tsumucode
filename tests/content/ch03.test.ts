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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch03/chapter.yaml');
});

describe('html-css-ch03', () => {
  it('リンク画像フォーム教材の固定IDと配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch03',
      lessonIds: [
        'html-css-ch03-l01',
        'html-css-ch03-l02',
        'html-css-ch03-l03',
        'html-css-ch03-l04',
      ],
      conceptSlideIds: [
        'html-css-ch03-l01-s01',
        'html-css-ch03-l01-s02',
        'html-css-ch03-l02-s01',
        'html-css-ch03-l02-s02',
        'html-css-ch03-l03-s01',
        'html-css-ch03-l03-s02',
        'html-css-ch03-l03-s03',
        'html-css-ch03-l04-s01',
        'html-css-ch03-l04-s02',
      ],
      standardExerciseIds: [
        'html-css-ch03-l01-e01',
        'html-css-ch03-l02-e01',
        'html-css-ch03-l03-e01',
        'html-css-ch03-l04-e01',
      ],
      estimatedMinutes: 35,
    });
  });

  it('LinkからContact Cardまでをread→transform／composeへ段階接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch03-l01', {
      beforeExercise: {
        'anchor-element': 'read',
        'href-attribute': 'read',
        'fragment-link': 'read',
        'external-link': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['fragment-link', 'external-link'],
    });
    expectLessonMastery(loaded, 'html-css-ch03-l02', {
      beforeExercise: {
        'image-element': 'read',
        'src-attribute': 'read',
        'alt-attribute': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['src-attribute', 'alt-attribute'],
    });
    expectLessonMastery(loaded, 'html-css-ch03-l03', {
      beforeExercise: {
        'input-element': 'read',
        'label-control-relation': 'read',
        'button-type': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['label-control-relation', 'button-type'],
    });
    expectLessonMastery(loaded, 'html-css-ch03-l04', {
      beforeExercise: {
        'address-element': 'read',
        'contact-card-composition': 'read',
      },
      exerciseLevel: 'compose',
      requiredConceptIds: ['address-element', 'contact-card-composition'],
    });
    await expectChapterConceptCoverage('html-css-ch03', [
      'html-css-ch03-l01',
      'html-css-ch03-l02',
      'html-css-ch03-l03',
      'html-css-ch03-l04',
    ]);
  }, 60_000);
});
