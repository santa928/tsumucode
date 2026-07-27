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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch11/chapter.yaml');
});

describe('html-css-ch11', () => {
  it('a11y教材の固定配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch11',
      lessonIds: [
        'html-css-ch11-l01',
        'html-css-ch11-l02',
        'html-css-ch11-l03',
        'html-css-ch11-l04',
      ],
      conceptSlideIds: [
        'html-css-ch11-l01-s01',
        'html-css-ch11-l01-s02',
        'html-css-ch11-l02-s01',
        'html-css-ch11-l02-s02',
        'html-css-ch11-l03-s01',
        'html-css-ch11-l03-s02',
        'html-css-ch11-l04-s01',
        'html-css-ch11-l04-s02',
      ],
      standardExerciseIds: [
        'html-css-ch11-l01-e01',
        'html-css-ch11-l02-e01',
        'html-css-ch11-l03-e01',
        'html-css-ch11-l04-e01',
      ],
      estimatedMinutes: 40,
    });
  });

  it('Keyboard操作から最終Auditまでをread→transform／composeへ段階接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch11-l01', {
      beforeExercise: {
        'dom-order': 'read',
        'keyboard-operation': 'read',
        'focus-visible': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['focus-visible'],
    });
    expectLessonMastery(loaded, 'html-css-ch11-l02', {
      beforeExercise: {
        'accessible-name': 'read',
        'label-text': 'read',
        'link-text': 'read',
        'alt-text': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['label-text', 'alt-text'],
    });
    expectLessonMastery(loaded, 'html-css-ch11-l03', {
      beforeExercise: { 'contrast-45': 'read', 'status-text': 'read' },
      exerciseLevel: 'transform',
      requiredConceptIds: ['contrast-45', 'status-text'],
    });
    expectLessonMastery(loaded, 'html-css-ch11-l04', {
      beforeExercise: { 'prefers-reduced-motion': 'read', 'final-a11y-audit': 'read' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['prefers-reduced-motion', 'final-a11y-audit'],
    });
    await expectChapterConceptCoverage('html-css-ch11', [
      'html-css-ch11-l01',
      'html-css-ch11-l02',
      'html-css-ch11-l03',
      'html-css-ch11-l04',
    ]);
  }, 60_000);

  it('Reduced Motion演習は実Media Queryを編集してreduce環境で検証する', async () => {
    const exercise = loaded.exercises.find(({ id }) => id === 'html-css-ch11-l04-e01');
    const starterHtml = await readFile(
      'content/html-css/chapters/html-css-ch11/lessons/html-css-ch11-l04/exercises/html-css-ch11-l04-e01/starter/index.html',
      'utf8',
    );
    const starterCss = await readFile(
      'content/html-css/chapters/html-css-ch11/lessons/html-css-ch11-l04/exercises/html-css-ch11-l04-e01/starter/styles.css',
      'utf8',
    );

    expect(starterHtml).not.toContain('reduce-motion');
    expect(starterCss).not.toContain('.reduce-motion');
    expect(starterCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*animation-duration:\s*0\.8s;/u,
    );
    const reducedViewport = exercise?.previewViewports.find(
      ({ id }) => id === 'mobile-390-reduced',
    );
    expect(reducedViewport?.reducedMotion).toBe('reduce');
    const sourceRule = exercise?.validationRules.find(
      ({ id }) => id === 'html-css-ch11-l04-e01-r10',
    );
    expect(sourceRule?.target).toEqual({ kind: 'source', file: 'styles.css' });
    expect(sourceRule?.assertion.kind).toBe('text');
    if (sourceRule?.assertion.kind !== 'text') throw new Error('Source Ruleが見つかりません');
    expect(sourceRule.assertion.operator).toBe('contains-normalized');
    expect(sourceRule.assertion.expected).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
