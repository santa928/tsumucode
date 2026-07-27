import { readFile } from 'node:fs/promises';
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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch10/chapter.yaml');
});

describe('html-css-ch10', () => {
  it('Responsive教材の固定配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch10',
      lessonIds: [
        'html-css-ch10-l01',
        'html-css-ch10-l02',
        'html-css-ch10-l03',
        'html-css-ch10-l04',
        'html-css-ch10-l05',
      ],
      conceptSlideIds: [
        'html-css-ch10-l01-s01',
        'html-css-ch10-l01-s02',
        'html-css-ch10-l02-s01',
        'html-css-ch10-l02-s02',
        'html-css-ch10-l03-s01',
        'html-css-ch10-l03-s02',
        'html-css-ch10-l04-s01',
        'html-css-ch10-l04-s02',
        'html-css-ch10-l05-s01',
        'html-css-ch10-l05-s02',
      ],
      standardExerciseIds: [
        'html-css-ch10-l01-e01',
        'html-css-ch10-l02-e01',
        'html-css-ch10-l03-e01',
        'html-css-ch10-l04-e01',
        'html-css-ch10-l05-e01',
      ],
      estimatedMinutes: 60,
    });
  });

  it('Viewport準備から4幅監査までをread→transform／composeへ段階接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch10-l01', {
      beforeExercise: { 'viewport-meta': 'read', 'mobile-first-base': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['viewport-meta', 'mobile-first-base'],
    });
    expectLessonMastery(loaded, 'html-css-ch10-l02', {
      beforeExercise: { 'content-breakpoint': 'read', 'media-query': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['content-breakpoint', 'media-query'],
    });
    expectLessonMastery(loaded, 'html-css-ch10-l03', {
      beforeExercise: { 'percentage-width': 'read', 'max-width': 'read', 'auto-margin': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['percentage-width', 'max-width'],
    });
    expectLessonMastery(loaded, 'html-css-ch10-l04', {
      beforeExercise: { 'responsive-image': 'read', 'height-auto': 'read', 'object-fit': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['responsive-image', 'object-fit'],
    });
    expectLessonMastery(loaded, 'html-css-ch10-l05', {
      beforeExercise: { 'horizontal-overflow': 'read', 'multi-viewport-audit': 'read' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['horizontal-overflow', 'multi-viewport-audit'],
    });
    await expectChapterConceptCoverage('html-css-ch10', [
      'html-css-ch10-l01',
      'html-css-ch10-l02',
      'html-css-ch10-l03',
      'html-css-ch10-l04',
      'html-css-ch10-l05',
    ]);
  }, 60_000);

  it('Fluid幅の編集導線はwidth宣言を指す', () => {
    const exercise = loaded.exercises.find(({ id }) => id === 'html-css-ch10-l03-e01');

    expect(exercise?.steps).toContainEqual(
      expect.objectContaining({
        id: 'make-container-fluid',
        starterAnchor: 'width: 900px;\n  max-width: 900px;',
      }),
    );
  });

  it('object-fit演習は非正方形画像をResponsive表示と固定Crop Boxで比較する', async () => {
    const exercise = loaded.exercises.find(({ id }) => id === 'html-css-ch10-l04-e01');
    const starterHtml = await readFile(
      'content/html-css/chapters/html-css-ch10/lessons/html-css-ch10-l04/exercises/html-css-ch10-l04-e01/starter/index.html',
      'utf8',
    );
    const starterCss = await readFile(
      'content/html-css/chapters/html-css-ch10/lessons/html-css-ch10-l04/exercises/html-css-ch10-l04-e01/starter/styles.css',
      'utf8',
    );
    const asset = await readFile(
      'content/html-css/chapters/html-css-ch10/lessons/html-css-ch10-l04/exercises/html-css-ch10-l04-e01/assets/profile-avatar.svg',
      'utf8',
    );

    expect(asset).toMatch(/<svg[^>]*width="480"[^>]*height="320"/u);
    expect(starterHtml).toContain('data-responsive-image');
    expect(starterHtml).toContain('data-crop-image');
    expect(starterCss).toMatch(/\[data-crop-image\][^{]*\{[^}]*height:\s*180px;/u);
    expect(exercise?.validationRules).toContainEqual(
      expect.objectContaining({
        id: 'html-css-ch10-l04-e01-r03',
        target: { kind: 'selector', selector: '[data-crop-image]' },
        assertion: {
          kind: 'computed-style',
          property: 'object-fit',
          operator: 'equals',
          expected: 'cover',
        },
      }),
    );
  });
});
