/** Slide Layoutごとの1画面Stage分割と安全なBlock描画を検証する。 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../../../tests/fixtures/course';
import type { Slide } from '../../../core/content/types';
import { SlideStage } from './SlideStage';

/** 2領域を持つcode-preview Slide Fixtureを返す。 */
function codePreviewSlide(): Slide {
  return {
    ...structuredClone(fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.slides[0]!),
    layout: 'code-preview',
    blocks: [
      { type: 'paragraph', text: 'h1はページ全体の題名を表します。' },
      { type: 'code', language: 'html', code: '<h1>学習ノート</h1>' },
      { type: 'image', assetId: 'heading-preview', alt: '見出しを表示したPreview' },
    ],
    assets: [
      {
        id: 'heading-preview',
        path: 'generated/assets/heading-preview.svg',
        mediaType: 'image',
        alt: '見出しのPreview',
        provenanceId: 'original-heading-preview',
      },
    ],
  };
}

describe('SlideStage', () => {
  it('Slideタイトルを設計シート内のh1として表示する', () => {
    const slide = codePreviewSlide();
    render(<SlideStage slide={slide} baseUrl="/tsumucode/" />);

    const stage = screen.getByTestId('slide-stage');
    expect(within(stage).getByRole('heading', { level: 1, name: slide.title })).toBeVisible();
  });

  it('指定された読書案内を本文より前に表示し、下部の図や予測を見つけられるようにする', () => {
    const cue = '図や予測の問いまで読み、本文が続くときは下へスクロールしてください。';
    render(<SlideStage slide={codePreviewSlide()} baseUrl="/tsumucode/" readingCue={cue} />);
    const notice = screen.getByText(cue);
    expect(notice).toBeVisible();
    expect(
      notice.compareDocumentPosition(screen.getByText('h1はページ全体の題名を表します。')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it('混在した説明・コード・結果を著者の順序で描画する', () => {
    const slide = codePreviewSlide();
    slide.blocks.push({ type: 'paragraph', text: '結果を見てから次の例へ進みます。' });
    render(<SlideStage slide={slide} baseUrl="/tsumucode/" />);

    expect(screen.getByTestId('slide-stage')).toHaveAttribute('data-slide-layout', 'code-preview');
    const ordered = screen.getByTestId('slide-stage').querySelectorAll('p, figcaption, pre, img');
    expect(
      [...ordered].map((element) =>
        element.tagName === 'IMG' ? element.getAttribute('alt') : element.textContent,
      ),
    ).toEqual([
      'h1はページ全体の題名を表します。',
      'html',
      '<h1>学習ノート</h1>',
      '静的な図：見出しを表示したPreview',
      '見出しを表示したPreview',
      '結果を見てから次の例へ進みます。',
    ]);
    expect(screen.getByRole('img', { name: '見出しを表示したPreview' })).toHaveAttribute(
      'src',
      '/tsumucode/generated/assets/heading-preview.svg',
    );
  });
});
