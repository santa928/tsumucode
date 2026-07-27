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

  it('code-preview Slideを説明とCode/Visualの2領域へ描画する', () => {
    render(<SlideStage slide={codePreviewSlide()} baseUrl="/tsumucode/" />);

    expect(screen.getByTestId('slide-stage')).toHaveAttribute('data-slide-layout', 'code-preview');
    expect(screen.getByTestId('slide-copy')).toHaveTextContent('h1はページ全体の題名を表します。');
    expect(screen.getByTestId('slide-visual')).toHaveTextContent('<h1>学習ノート</h1>');
    expect(screen.getByRole('img', { name: '見出しを表示したPreview' })).toHaveAttribute(
      'src',
      '/tsumucode/generated/assets/heading-preview.svg',
    );
  });
});
