/** 固定学習ShellがHeader、救済Scroll Stage、Pagerを分離することを検証する。 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LearningViewportShell } from './LearningViewportShell';

describe('LearningViewportShell', () => {
  it('学習内容を3領域へ分け、Stageだけを救済Scroll領域にする', () => {
    render(
      <LearningViewportShell
        label="スライド学習"
        header={<h1>HTMLの仕組み</h1>}
        pager={<button type="button">次へ</button>}
      >
        <p>HTMLは内容の意味を組み立てます。</p>
      </LearningViewportShell>,
    );

    const shell = screen.getByRole('region', { name: 'スライド学習' });
    const stage = screen.getByRole('region', { name: 'スライド学習の本文' });
    expect(shell).toHaveClass('tc-learning-viewport-shell');
    expect(stage).toHaveClass('tc-learning-shell-stage');
    expect(stage).toHaveAttribute('tabindex', '0');
    expect(stage).toHaveTextContent('HTMLは内容の意味を組み立てます。');
    expect(screen.getByRole('button', { name: '次へ' })).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });
});
