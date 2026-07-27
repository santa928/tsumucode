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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch05/chapter.yaml');
});

describe('html-css-ch05', () => {
  it('Box Model教材の固定IDと配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch05',
      lessonIds: [
        'html-css-ch05-l01',
        'html-css-ch05-l02',
        'html-css-ch05-l03',
        'html-css-ch05-l04',
        'html-css-ch05-l05',
      ],
      conceptSlideIds: [
        'html-css-ch05-l01-s01',
        'html-css-ch05-l01-s02',
        'html-css-ch05-l02-s01',
        'html-css-ch05-l02-s02',
        'html-css-ch05-l03-s01',
        'html-css-ch05-l03-s02',
        'html-css-ch05-l04-s01',
        'html-css-ch05-l04-s02',
        'html-css-ch05-l05-s01',
        'html-css-ch05-l05-s02',
      ],
      standardExerciseIds: [
        'html-css-ch05-l01-e01',
        'html-css-ch05-l02-e01',
        'html-css-ch05-l03-e01',
        'html-css-ch05-l04-e01',
        'html-css-ch05-l05-e01',
      ],
      estimatedMinutes: 50,
    });
  });

  it('Boxの4層から安全なSizingまでをread→transformへ段階接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch05-l01', {
      beforeExercise: { 'box-model-content-padding-border-margin': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['box-model-content-padding-border-margin'],
    });
    expectLessonMastery(loaded, 'html-css-ch05-l02', {
      beforeExercise: { 'width-height': 'read', 'box-sizing-border-box': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['width-height', 'box-sizing-border-box'],
    });
    expectLessonMastery(loaded, 'html-css-ch05-l03', {
      beforeExercise: { 'padding-property': 'read', 'margin-property': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['padding-property', 'margin-property'],
    });
    expectLessonMastery(loaded, 'html-css-ch05-l04', {
      beforeExercise: { 'display-inline-block': 'read', 'minimum-target-size': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['display-inline-block', 'minimum-target-size'],
    });
    expectLessonMastery(loaded, 'html-css-ch05-l05', {
      beforeExercise: { 'overflow-x': 'read', 'safe-sizing': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['overflow-x', 'safe-sizing'],
    });
    await expectChapterConceptCoverage('html-css-ch05', [
      'html-css-ch05-l01',
      'html-css-ch05-l02',
      'html-css-ch05-l03',
      'html-css-ch05-l04',
      'html-css-ch05-l05',
    ]);
  }, 60_000);

  it('安全なSizing演習はFrameの実測rightとbottomへCardを収める', async () => {
    const exercise = loaded.exercises.find(({ id }) => id === 'html-css-ch05-l05-e01');
    const starter = await readFile(
      'content/html-css/chapters/html-css-ch05/lessons/html-css-ch05-l05/exercises/html-css-ch05-l05-e01/starter/styles.css',
      'utf8',
    );

    expect(starter).toMatch(/\.frame\s*\{[^}]*height:\s*220px;/u);
    expect(starter).toMatch(/\.safe-card\s*\{[^}]*height:\s*240px;/u);
    expect(exercise?.validationRules).toContainEqual(
      expect.objectContaining({
        id: 'html-css-ch05-l05-e01-r03',
        target: { kind: 'selector', selector: '.safe-card' },
        assertion: {
          kind: 'relation',
          relation: 'contained-by',
          otherSelector: '.frame',
        },
      }),
    );
  });
});
