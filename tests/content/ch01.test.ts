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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch01/chapter.yaml');
});

describe('html-css-ch01', () => {
  it('HTML基礎教材の固定IDと配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch01',
      lessonIds: ['html-css-ch01-l01', 'html-css-ch01-l02', 'html-css-ch01-l03'],
      conceptSlideIds: [
        'html-css-ch01-l01-s01',
        'html-css-ch01-l01-s02',
        'html-css-ch01-l01-s03',
        'html-css-ch01-l01-s04',
        'html-css-ch01-l02-s01',
        'html-css-ch01-l02-s02',
        'html-css-ch01-l02-s03',
        'html-css-ch01-l03-s01',
        'html-css-ch01-l03-s02',
      ],
      standardExerciseIds: [
        'html-css-ch01-l01-e01',
        'html-css-ch01-l02-e01',
        'html-css-ch01-l03-e01',
      ],
      estimatedMinutes: 35,
    });
  });

  it('ElementからAttributeまでをLessonごとのread→実習到達へ接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch01-l01', {
      beforeExercise: {
        'html-element': 'read',
        'opening-closing-tag': 'read',
        'heading-h1': 'read',
        'paragraph-p': 'read',
      },
      exerciseLevel: 'fill',
      requiredConceptIds: ['heading-h1', 'paragraph-p'],
    });
    expectLessonMastery(loaded, 'html-css-ch01-l02', {
      beforeExercise: {
        'html-parent-child': 'read',
        nesting: 'read',
        indentation: 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['nesting', 'indentation'],
    });
    expectLessonMastery(loaded, 'html-css-ch01-l03', {
      beforeExercise: {
        'html-attribute': 'read',
        'lang-attribute': 'read',
        'title-element': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['lang-attribute', 'title-element'],
    });
    await expectChapterConceptCoverage('html-css-ch01', [
      'html-css-ch01-l01',
      'html-css-ch01-l02',
      'html-css-ch01-l03',
    ]);
  }, 60_000);

  it('Element穴埋めStarterを用意し、未追跡のcharsetを判定対象にしない', async () => {
    const starter = await readFile(
      'content/html-css/chapters/html-css-ch01/lessons/html-css-ch01-l01/exercises/html-css-ch01-l01-e01/starter/index.html',
      'utf8',
    );
    const attributeExercise = loaded.exercises.find(({ id }) => id === 'html-css-ch01-l03-e01');

    expect(starter).toMatch(/<h1>[\s\S]*<\/h1>[\s\S]*<p>[\s\S]*<\/p>/u);
    expect(
      attributeExercise?.validationRules.some(
        ({ target }) => target.kind === 'selector' && target.selector === 'meta[charset]',
      ),
    ).toBe(false);
  });

  it('各Stepの指定完成状態を厳密に判定し、弱い境界例を不合格にする', () => {
    const elementExercise = loaded.exercises.find(({ id }) => id === 'html-css-ch01-l01-e01');
    const nestingExercise = loaded.exercises.find(({ id }) => id === 'html-css-ch01-l02-e01');
    const attributeExercise = loaded.exercises.find(({ id }) => id === 'html-css-ch01-l03-e01');

    expect(elementExercise?.validationRules).toContainEqual(
      expect.objectContaining({
        id: 'html-css-ch01-l01-e01-r01',
        assertion: { kind: 'text', operator: 'equals', expected: 'わたしのプロフィール' },
      }),
    );
    expect(elementExercise?.fixtures).toContainEqual(
      expect.objectContaining({
        id: 'html-css-ch01-l01-e01-wrong-heading',
        expectedFeedbackRuleIds: ['html-css-ch01-l01-e01-r01'],
      }),
    );
    expect(nestingExercise?.validationRules).toContainEqual(
      expect.objectContaining({
        id: 'html-css-ch01-l02-e01-r03',
        target: { kind: 'source', file: 'index.html' },
        assertion: {
          kind: 'text',
          operator: 'contains',
          expected: '\n      <p>HTMLの親子関係を練習しています。</p>\n',
        },
      }),
    );
    expect(nestingExercise?.fixtures).toContainEqual(
      expect.objectContaining({
        id: 'html-css-ch01-l02-e01-unindented',
        expectedFeedbackRuleIds: ['html-css-ch01-l02-e01-r03'],
      }),
    );
    expect(attributeExercise?.validationRules).toContainEqual(
      expect.objectContaining({
        id: 'html-css-ch01-l03-e01-r02',
        assertion: { kind: 'text', operator: 'equals', expected: 'HTML学習プロフィール' },
      }),
    );
    expect(attributeExercise?.fixtures).toContainEqual(
      expect.objectContaining({
        id: 'html-css-ch01-l03-e01-short-title',
        expectedFeedbackRuleIds: ['html-css-ch01-l03-e01-r02'],
      }),
    );
  });
});
