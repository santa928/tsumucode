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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch02/chapter.yaml');
});

describe('html-css-ch02', () => {
  it('意味のある文章構造教材の固定IDと配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch02',
      lessonIds: [
        'html-css-ch02-l01',
        'html-css-ch02-l02',
        'html-css-ch02-l03',
        'html-css-ch02-l04',
      ],
      conceptSlideIds: [
        'html-css-ch02-l01-s01',
        'html-css-ch02-l01-s02',
        'html-css-ch02-l02-s01',
        'html-css-ch02-l02-s02',
        'html-css-ch02-l03-s01',
        'html-css-ch02-l03-s02',
        'html-css-ch02-l03-s03',
        'html-css-ch02-l04-s01',
        'html-css-ch02-l04-s02',
      ],
      standardExerciseIds: [
        'html-css-ch02-l01-e01',
        'html-css-ch02-l02-e01',
        'html-css-ch02-l03-e01',
        'html-css-ch02-l04-e01',
      ],
      estimatedMinutes: 40,
    });
  });

  it('見出しからInline意味までをread→transformへ段階接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch02-l01', {
      beforeExercise: {
        'heading-hierarchy': 'read',
        h2: 'read',
        'section-paragraph': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['h2', 'section-paragraph'],
    });
    expectLessonMastery(loaded, 'html-css-ch02-l02', {
      beforeExercise: {
        'unordered-list': 'read',
        'ordered-list': 'read',
        'list-item': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['ordered-list', 'list-item'],
    });
    expectLessonMastery(loaded, 'html-css-ch02-l03', {
      beforeExercise: {
        'landmark-elements': 'read',
        'header-main-footer': 'read',
        'section-article': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['header-main-footer', 'section-article'],
    });
    expectLessonMastery(loaded, 'html-css-ch02-l04', {
      beforeExercise: {
        'strong-element': 'read',
        'em-element': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['strong-element', 'em-element'],
    });
    await expectChapterConceptCoverage('html-css-ch02', [
      'html-css-ch02-l01',
      'html-css-ch02-l02',
      'html-css-ch02-l03',
      'html-css-ch02-l04',
    ]);
  }, 60_000);
});
