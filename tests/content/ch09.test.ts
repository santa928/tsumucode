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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch09/chapter.yaml');
});

describe('html-css-ch09', () => {
  it('Grid教材の固定配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch09',
      lessonIds: [
        'html-css-ch09-l01',
        'html-css-ch09-l02',
        'html-css-ch09-l03',
        'html-css-ch09-l04',
      ],
      conceptSlideIds: [
        'html-css-ch09-l01-s01',
        'html-css-ch09-l01-s02',
        'html-css-ch09-l02-s01',
        'html-css-ch09-l02-s02',
        'html-css-ch09-l03-s01',
        'html-css-ch09-l03-s02',
        'html-css-ch09-l04-s01',
        'html-css-ch09-l04-s02',
      ],
      standardExerciseIds: [
        'html-css-ch09-l01-e01',
        'html-css-ch09-l02-e01',
        'html-css-ch09-l03-e01',
        'html-css-ch09-l04-e01',
      ],
      estimatedMinutes: 45,
    });
  });

  it('明示TrackからResponsiveな統合Layoutまでをread→transform／composeへ段階接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch09-l01', {
      beforeExercise: { 'grid-container': 'read', 'grid-template-columns': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['grid-container', 'grid-template-columns'],
    });
    expectLessonMastery(loaded, 'html-css-ch09-l02', {
      beforeExercise: { 'repeat-function': 'read', 'fr-unit': 'read', 'grid-gap': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['repeat-function', 'fr-unit'],
    });
    expectLessonMastery(loaded, 'html-css-ch09-l03', {
      beforeExercise: { 'minmax-function': 'read', 'auto-fit': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['minmax-function', 'auto-fit'],
    });
    expectLessonMastery(loaded, 'html-css-ch09-l04', {
      beforeExercise: { 'grid-line-placement': 'read', 'grid-flex-choice': 'read' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['grid-line-placement', 'grid-flex-choice'],
    });
    await expectChapterConceptCoverage('html-css-ch09', [
      'html-css-ch09-l01',
      'html-css-ch09-l02',
      'html-css-ch09-l03',
      'html-css-ch09-l04',
    ]);
  }, 60_000);

  it('最初のGrid演習Starterは次Lessonで学ぶfrを先取りしない', async () => {
    const exercise = loaded.exercises.find(({ id }) => id === 'html-css-ch09-l01-e01');
    const starter = await readFile(
      'content/html-css/chapters/html-css-ch09/lessons/html-css-ch09-l01/exercises/html-css-ch09-l01-e01/starter/styles.css',
      'utf8',
    );

    expect(starter).not.toMatch(/\d+(?:\.\d+)?fr\b/u);
    expect(exercise?.steps).toContainEqual(
      expect.objectContaining({
        id: 'define-two-column-tracks',
        starterAnchor: 'grid-template-columns: 200px;',
      }),
    );
  });
});
