import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ActionLink } from './ActionLink';
import { BetaBadge } from './BetaBadge';
import { PieceProgress } from './PieceProgress';
import { StackedCard } from './StackedCard';
import { StatusBadge } from './StatusBadge';
import { WorkshopNotice } from './WorkshopNotice';

describe('Design System primitives', () => {
  it('BetaBadgeは短い表示とベータ版の画像代替テキストを両立する', () => {
    render(<BetaBadge />);
    expect(screen.getByRole('img', { name: 'ベータ版' })).toHaveTextContent('β');
  });

  it('StackedCardの要素型とspacingを利用側が安全に上書きできる', () => {
    render(
      <StackedCard as="article" className="p-2">
        設計図
      </StackedCard>,
    );
    const card = screen.getByRole('article');
    expect(card).toHaveClass('p-2');
    expect(card).not.toHaveClass('p-6');
  });

  it('StackedCardのradiusを利用側classだけへ正規化する', () => {
    render(<StackedCard className="rounded-none">作業台</StackedCard>);
    const card = screen.getByText('作業台');
    expect([...card.classList].filter((className) => className.startsWith('rounded'))).toEqual([
      'rounded-none',
    ]);
  });

  it('StackedCardが選択した要素のnative propsとrefを透過する', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <StackedCard as="button" ref={ref} type="button" disabled>
        ピースを確認
      </StackedCard>,
    );
    const button = screen.getByRole('button', { name: 'ピースを確認' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('type', 'button');
    expect(ref.current).toBe(button);
  });

  it('ActionLinkは見える文字をAccessible Nameにする', () => {
    render(
      <MemoryRouter>
        <ActionLink to="/courses">教材を選ぶ</ActionLink>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: '教材を選ぶ' })).toBeInTheDocument();
  });

  it('TextのActionLinkは見える文字と異なるariaLabelを型で拒否する', () => {
    const createMismatchedTextLabel = () => (
      // @ts-expect-error Text childrenは見える文字をAccessible Nameにする。
      <ActionLink to="/courses" ariaLabel="別の名前">
        教材を選ぶ
      </ActionLink>
    );

    expect(createMismatchedTextLabel).toBeTypeOf('function');
  });

  it('ActionLinkのspacingとradiusを利用側classだけへ正規化する', () => {
    render(
      <MemoryRouter>
        <ActionLink to="/courses" className="px-8 rounded-none">
          教材を選ぶ
        </ActionLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: '教材を選ぶ' });
    expect(link).toHaveClass('px-8');
    expect(link).not.toHaveClass('px-5');
    expect([...link.classList].filter((className) => className.startsWith('rounded'))).toEqual([
      'rounded-none',
    ]);
  });

  it('空の見える文字だけではActionLinkを作れない', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <ActionLink to="/courses"> </ActionLink>
        </MemoryRouter>,
      ),
    ).toThrow('ActionLinkにはAccessible Nameが必要です。');
  });

  it('非TextのActionLinkを型で拒否する', () => {
    const createIconLink = () => (
      // @ts-expect-error ActionLinkは見えるTextをAccessible Nameにする。
      <ActionLink to="/next">
        <span aria-hidden="true">→</span>
      </ActionLink>
    );

    expect(createIconLink).toBeTypeOf('function');
  });

  it.each([
    ['complete', '完了'],
    ['current', '現在のピース'],
    ['not-started', '未着手'],
  ] as const)('%sを色だけでなくTextでも示す', (status, label) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveAttribute('data-status', status);
  });

  it('StatusBadgeのradiusを利用側classだけへ正規化する', () => {
    render(<StatusBadge status="current" className="rounded-none" />);
    const badge = screen.getByText('現在のピース');
    expect([...badge.classList].filter((className) => className.startsWith('rounded'))).toEqual([
      'rounded-none',
    ]);
  });

  it('PieceProgressは数値とnative progressで進捗を伝える', () => {
    render(<PieceProgress completed={3} total={5} label="HTML/CSSコース" />);

    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'HTML/CSSコース' })).toHaveAttribute(
      'aria-valuetext',
      '3 / 5 ピース完了',
    );
    expect(screen.getAllByTestId('progress-piece')).toHaveLength(5);
  });

  it('PieceProgressは範囲外の値を安全な進捗へ丸める', () => {
    render(<PieceProgress completed={9} total={3} label="章の進捗" />);

    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '章の進捗' })).toHaveValue(3);
  });

  it('PieceProgressのcompact表示はnative progressを保って装飾Pieceだけを省く', () => {
    render(<PieceProgress completed={4} total={4} label="スライドの現在位置" compact />);

    expect(screen.getByText('4 / 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'スライドの現在位置' })).toBeInTheDocument();
    expect(screen.queryByTestId('progress-piece')).not.toBeInTheDocument();
  });

  it.each([
    ['learning', '学習のヒント'],
    ['complete', '完了'],
    ['correction', '確認するところ'],
    ['neutral', 'お知らせ'],
  ] as const)('WorkshopNoticeの%s toneを文字でも示す', (tone, label) => {
    render(
      <WorkshopNotice tone={tone} title="次の操作">
        コードを1行書き換えます。
      </WorkshopNotice>,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '次の操作' })).toHaveAttribute(
      'data-tone',
      tone,
    );
  });
});
