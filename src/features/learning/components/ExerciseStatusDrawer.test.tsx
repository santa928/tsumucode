/** FeedbackとHintが同じDrawer Slotを交代利用することを検証する。 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseStatusDrawer } from './ExerciseStatusDrawer';

describe('ExerciseStatusDrawer', () => {
  it('FeedbackとHintを同時に2枚描画しない', () => {
    const common = {
      result: undefined,
      hints: [],
      revealedHintIds: [],
      placement: 'side' as const,
      onClose: vi.fn(),
      onRevealNextHint: vi.fn(),
      onReviewSlide: vi.fn(),
    };
    const { rerender } = render(<ExerciseStatusDrawer {...common} mode="feedback" />);
    expect(screen.getByRole('dialog', { name: '判定結果' })).toBeVisible();

    rerender(<ExerciseStatusDrawer {...common} mode="hint" />);
    expect(screen.queryByRole('dialog', { name: '判定結果' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'ヒント' })).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
