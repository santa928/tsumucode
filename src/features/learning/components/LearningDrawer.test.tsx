/** 学習DrawerのModal表示、Escape、Focus復帰を検証する。 */
import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LearningDrawer } from './LearningDrawer';

/** TriggerとDrawerを同じFocus lifecycleで操作するTest Harness。 */
function DrawerHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        用語を開く
      </button>
      <LearningDrawer
        open={open}
        title="このレッスンの用語"
        placement="side"
        returnFocusRef={triggerRef}
        onClose={() => {
          setOpen(false);
        }}
      >
        <p>ElementはTagと内容を合わせたまとまりです。</p>
      </LearningDrawer>
    </>
  );
}

describe('LearningDrawer', () => {
  it('開いたDrawerへFocusしEscapeで閉じてTriggerへ戻す', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    const trigger = screen.getByRole('button', { name: '用語を開く' });

    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'このレッスンの用語' })).toBeVisible();
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
