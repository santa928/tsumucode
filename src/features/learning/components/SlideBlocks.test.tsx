import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AssetRef, SlideBlock } from '../../../core/content/types';
import { SlideBlocks } from './SlideBlocks';

const blocks: SlideBlock[] = [
  { type: 'heading', level: 2, text: 'HTMLの役割' },
  { type: 'heading', level: 3, text: '意味を積む' },
  { type: 'paragraph', text: '意味と構造を表します。' },
  { type: 'list', style: 'ordered', items: ['題名を決める', 'h1で囲む'] },
  { type: 'list', style: 'unordered', items: ['開始タグ', '終了タグ'] },
  { type: 'code', language: 'html', code: '<script>alert("実行しない")</script>' },
  { type: 'image', assetId: 'html-diagram', alt: 'HTML要素の組み立て図' },
  {
    type: 'practice',
    prompt: 'ページの題名を探します。',
    expectedAction: 'h1が題名を表すことを確認する',
    estimatedMinutes: 2,
  },
  { type: 'callout', tone: 'note', title: '覚えておこう', text: 'HTMLは意味を表します。' },
  { type: 'callout', tone: 'tip', text: '声に出して読むと整理できます。' },
  { type: 'callout', tone: 'warning', text: 'タグの閉じ忘れに注意します。' },
];

const assets: AssetRef[] = [
  {
    id: 'html-diagram',
    path: 'generated/assets/html-diagram.svg',
    mediaType: 'image',
    alt: 'HTML要素の図',
    provenanceId: 'original-html-diagram',
  },
];

describe('SlideBlocks', () => {
  it('許可された全Blockを意味に合うHTML要素へ写像する', () => {
    const { container } = render(
      <SlideBlocks blocks={blocks} assets={assets} baseUrl="/repository-name/" />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'HTMLの役割' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '意味を積む' })).toBeInTheDocument();
    expect(screen.getByText('意味と構造を表します。')).toBeInTheDocument();

    const orderedList = screen.getByRole('list', { name: '手順' });
    expect(orderedList.tagName).toBe('OL');
    expect(within(orderedList).getAllByRole('listitem')).toHaveLength(2);
    const unorderedList = screen.getByRole('list', { name: 'ポイント' });
    expect(unorderedList.tagName).toBe('UL');

    expect(screen.getByText('<script>alert("実行しない")</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('html')).toBeInTheDocument();
    const codeRegion = screen.getByLabelText('htmlのコード例（横スクロール可能）');
    expect(codeRegion.tagName).toBe('PRE');
    expect(codeRegion).toHaveAttribute('tabindex', '0');
    expect(codeRegion).toHaveAttribute('data-slide-horizontal-scroll');

    expect(screen.getByRole('img', { name: 'HTML要素の組み立て図' })).toHaveAttribute(
      'src',
      '/repository-name/generated/assets/html-diagram.svg',
    );
    expect(screen.getByRole('region', { name: '今すぐ試す（約2分）' })).toHaveTextContent(
      '確認すること：h1が題名を表すことを確認する',
    );
    expect(screen.getAllByRole('note')).toHaveLength(3);
    const titledNote = screen.getByRole('note', { name: 'メモ：覚えておこう' });
    expect(within(titledNote).getByText('メモ')).toBeInTheDocument();
    expect(within(titledNote).getByText('覚えておこう')).toBeInTheDocument();
    expect(screen.getByRole('note', { name: '組み立てのコツ' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: '注意' })).toBeInTheDocument();
  });

  it('Image Blockが所有していないAssetを参照した場合は明示的に失敗する', () => {
    expect(() =>
      render(
        <SlideBlocks
          blocks={[{ type: 'image', assetId: 'missing-image', alt: '存在しない画像' }]}
          assets={[]}
          baseUrl="/"
        />,
      ),
    ).toThrow('Slide Assetが見つかりません: missing-image');
  });

  it('Image Blockが画像以外のAssetを参照した場合は明示的に失敗する', () => {
    const nonImageAsset: AssetRef = { ...assets[0]!, mediaType: 'other' };

    expect(() =>
      render(
        <SlideBlocks
          blocks={[{ type: 'image', assetId: 'html-diagram', alt: '画像ではないAsset' }]}
          assets={[nonImageAsset]}
          baseUrl="/"
        />,
      ),
    ).toThrow('Slide Assetが画像ではありません: html-diagram');
  });

  it('Image Assetの安全でない相対Pathを描画前に拒否する', () => {
    const unsafeAsset: AssetRef = { ...assets[0]!, path: '../secret.svg' };

    expect(() =>
      render(
        <SlideBlocks
          blocks={[{ type: 'image', assetId: 'html-diagram', alt: '安全でない画像' }]}
          assets={[unsafeAsset]}
          baseUrl="/repository-name/"
        />,
      ),
    ).toThrow('Public Asset pathは安全な相対Pathで指定してください。');
  });
});
