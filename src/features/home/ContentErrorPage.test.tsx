import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';
import { ContentLoadError } from '../../core/content/loadCourseCatalog';
import { ContentErrorPage } from './ContentErrorPage';

describe('ContentErrorPage', () => {
  it('内部詳細を出さず、失敗を通知して再試行できる', async () => {
    const user = userEvent.setup();
    let resolveRetry!: (value: null) => void;
    const pendingRetry = new Promise<null>((resolve) => {
      resolveRetry = resolve;
    });
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new ContentLoadError('http', '/generated/content/catalog.json'))
      .mockReturnValueOnce(pendingRetry);
    const router = createMemoryRouter([
      {
        path: '/',
        loader,
        element: <h1>教材を再取得しました</h1>,
        errorElement: <ContentErrorPage />,
        HydrateFallback: () => <p>教材を準備中</p>,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { name: '教材を読み込めませんでした' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveTextContent('/generated/content/catalog.json');
    const retryButton = screen.getByRole('button', { name: 'もう一度読み込む' });
    await user.click(retryButton);
    expect(screen.getByRole('button', { name: '読み込み中' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('教材を再読み込みしています。');

    await act(async () => {
      resolveRetry(null);
      await pendingRetry;
    });
    expect(
      await screen.findByRole('heading', { name: '教材を再取得しました' }),
    ).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('未知のRoute失敗にも教材一覧へ戻るLinkを提供する', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        loader: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Routerのroute error再現にはResponse送出が必要。
          throw new Response('not found', { status: 404 });
        },
        element: <div />,
        errorElement: <ContentErrorPage />,
        HydrateFallback: () => <p>教材を準備中</p>,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('link', { name: '教材一覧へ戻る' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
