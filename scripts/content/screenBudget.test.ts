/** Slideの文字・Code・Visual・Practice構造予算を検証する。 */
import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../tests/fixtures/course';
import type { Slide } from '../../src/core/content/types';
import { assertSlideScreenBudget, measureSlideContent } from './screenBudget';

/** 独立して破壊できるSlide Fixtureを返す。 */
function slideFixture(): Slide {
  const lesson = structuredClone(fixtureCourse).phases[0]?.chapters[0]?.lessons[0];
  const slide = lesson?.slides[0];
  if (slide === undefined) throw new Error('Slide fixtureがありません');
  return slide;
}

describe('Slide screen budget', () => {
  it('Block種別ごとの文字・Code行・Visual・Practiceを合算する', () => {
    const slide = slideFixture();
    slide.blocks = [
      { type: 'heading', level: 2, text: '見出し' },
      { type: 'paragraph', text: '本文' },
      { type: 'list', style: 'unordered', items: ['一', '二'] },
      { type: 'callout', tone: 'tip', title: 'コツ', text: '説明' },
      { type: 'code', language: 'html', code: '<h1>x</h1>\n<p>y</p>' },
      { type: 'image', assetId: 'preview-image', alt: '結果' },
      {
        type: 'practice',
        prompt: '探す',
        expectedAction: '確認する',
        estimatedMinutes: 1,
      },
    ];

    expect(measureSlideContent(slide)).toEqual({
      textCharacters: 17,
      codeLines: 2,
      visuals: 1,
      practiceBlocks: 1,
    });
  });

  it('code-previewのCode行数超過を拒否する', () => {
    const slide = slideFixture();
    slide.layout = 'code-preview';
    slide.screenBudget = { maxTextCharacters: 240, maxCodeLines: 8, maxVisuals: 1 };
    slide.blocks = [
      {
        type: 'code',
        language: 'html',
        code: Array.from({ length: 9 }, () => '<p>x</p>').join('\n'),
      },
      { type: 'image', assetId: 'preview-image', alt: '結果' },
    ];

    expect(() => {
      assertSlideScreenBudget(slide);
    }).toThrow(/maxCodeLines=8/u);
  });

  it('explanationへCodeを置かず、code-previewへCodeとVisualを要求する', () => {
    const explanation = slideFixture();
    explanation.layout = 'explanation';
    explanation.blocks = [{ type: 'code', language: 'html', code: '<p>x</p>' }];
    expect(() => {
      assertSlideScreenBudget(explanation);
    }).toThrow(/explanation.*Code 0件/u);

    const preview = slideFixture();
    preview.layout = 'code-preview';
    preview.blocks = [{ type: 'code', language: 'html', code: '<p>x</p>' }];
    expect(() => {
      assertSlideScreenBudget(preview);
    }).toThrow(/code-preview.*Visual 1件以上/u);
  });

  it('checkpointへPracticeを1件要求し、全Layoutで2件を拒否する', () => {
    const checkpoint = slideFixture();
    checkpoint.layout = 'checkpoint';
    checkpoint.blocks = [{ type: 'paragraph', text: '確認します。' }];
    expect(() => {
      assertSlideScreenBudget(checkpoint);
    }).toThrow(/checkpoint.*Practice 1件/u);

    checkpoint.blocks = [
      {
        type: 'practice',
        prompt: '1つ目',
        expectedAction: '確認する',
        estimatedMinutes: 1,
      },
      {
        type: 'practice',
        prompt: '2つ目',
        expectedAction: '確認する',
        estimatedMinutes: 1,
      },
    ];
    expect(() => {
      assertSlideScreenBudget(checkpoint);
    }).toThrow(/Practiceは最大1件/u);
  });
});
