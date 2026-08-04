import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RuntimeConsole } from './RuntimeConsole';

describe('RuntimeConsole', () => {
  it('Console recordをlevel付きplain textとして順番に表示する', () => {
    render(
      <RuntimeConsole
        records={[
          { sequence: 0, level: 'warn', text: '<b>plain</b>' },
          { sequence: 1, level: 'error', text: '停止しました' },
        ]}
        freshness="current"
      />,
    );

    const region = screen.getByRole('region', { name: 'Console出力' });
    expect(region).toBeVisible();
    expect(screen.getByText('<b>plain</b>')).toBeVisible();
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText('warn')).toBeVisible();
    expect(screen.getByText('error')).toBeVisible();
    expect(region.querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('空状態と前回成功時の出力であることをtextで伝える', () => {
    const { rerender } = render(<RuntimeConsole records={[]} freshness="current" />);

    expect(screen.getByText('まだConsole出力はありません')).toBeVisible();

    rerender(
      <RuntimeConsole
        records={[{ sequence: 0, level: 'log', text: '前回の値' }]}
        freshness="previous-success"
      />,
    );
    expect(screen.getByText('前回成功時のConsoleです')).toBeVisible();
    expect(screen.getByText('前回の値')).toBeVisible();
  });
});
