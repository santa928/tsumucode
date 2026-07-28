import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { LibraryShell } from './LibraryShell';

/** ShellのIndexとViewer表示差だけを検証するMemory Routerを作る。 */
function renderShell(initialEntry: string): void {
  const router = createMemoryRouter(
    [
      {
        path: '/library/:courseId',
        element: <LibraryShell />,
        children: [
          { index: true, element: <p>スライド目次本文</p> },
          {
            path: 'lessons/:lessonId/slides/:slideId',
            element: <p>スライドViewer本文</p>,
          },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
}

describe('LibraryShell', () => {
  it('目次ではBrand HeaderとDocument Scroll可能なMainを表示する', () => {
    renderShell('/library/html-css');

    expect(screen.getByTestId('library-shell')).toHaveAttribute('data-library-viewer', 'false');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TsumuCodeホームへ' })).toHaveAttribute('href', '/');
    expect(screen.getByLabelText('ベータ版')).toBeVisible();
    expect(screen.getByRole('main')).toHaveClass('tc-library-index-main');
    expect(screen.getByRole('main')).not.toHaveClass('tc-learning-main');
  });

  it('ViewerではGlobal HeaderとFooterを省き、固定学習Mainを全面利用する', () => {
    renderShell('/library/html-css/lessons/lesson-a/slides/slide-a-1');

    expect(screen.getByTestId('library-shell')).toHaveAttribute('data-library-viewer', 'true');
    expect(screen.getByRole('main')).toHaveClass('tc-learning-main');
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });
});
