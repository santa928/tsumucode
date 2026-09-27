import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCatalog } from '../../../tests/fixtures/course';
import type { CourseProgress } from '../../core/persistence/contracts';
import { HomePage } from './HomePage';

const hooks = vi.hoisted(() => ({ progress: vi.fn(), editable: vi.fn() }));
vi.mock('../progress/useCourseProgress', () => ({ useCourseProgress: hooks.progress }));
vi.mock('../../shared/device/editingCapability', () => ({ useEditingCapability: hooks.editable }));
vi.mock('../progress/ProgressTransferPanel', () => ({
  ProgressTransferPanel: () => <section aria-label="端末データPanel" />,
}));
const lessonId = 'html-css-ch00-l01';
const course = {
  ...fixtureCatalog.courses[0]!,
  lessonStarts: [{ lessonId, target: { kind: 'slide' as const, targetId: `${lessonId}-s01` } }],
};
const retry = vi.fn();

/** 本番と同じ有限HTML導入のCatalogを使い、保存状態だけを切り替える。 */
function renderHome() {
  const router = createMemoryRouter([
    {
      path: '/',
      loader: () => ({ catalog: fixtureCatalog, publishedCourses: [course], publishedPaths: [] }),
      HydrateFallback: () => <p>教材を準備中</p>,
      element: <HomePage />,
    },
  ]);
  render(<RouterProvider router={router} />);
  return screen.findByRole('region', { name: '今回の学習' });
}

describe('Home先頭の小さな行動', () => {
  beforeEach(() => {
    retry.mockClear();
    hooks.editable.mockReturnValue(true);
    hooks.progress.mockReturnValue({
      status: 'ready',
      progress: undefined,
      error: undefined,
      retry,
    });
  });

  it('未開始を確認したPCでは成果と目安を示し、最初の説明へ進む', async () => {
    const region = within(await renderHome());
    expect(region.getByText('目安10分')).toBeInTheDocument();
    expect(region.getByRole('link', { name: '見出しと背景色を変えてみる' })).toHaveAttribute(
      'href',
      `/courses/html-css/lessons/${lessonId}/slides/${lessonId}-s01`,
    );
    expect(region.getByRole('link', { name: '解説だけ読む' })).toHaveAttribute(
      'href',
      '/library/html-css',
    );
    expect(screen.getByRole('heading', { name: '個別コースを選ぶ' })).toBeInTheDocument();
  });

  it.each(['loading', 'error'] as const)(
    '保存状態%sを未開始と断定せず、読書と再確認を残す',
    async (status) => {
      hooks.progress.mockReturnValue({ status, progress: undefined, error: '読込失敗', retry });
      const region = within(await renderHome());
      expect(
        region.queryByRole('link', { name: '見出しと背景色を変えてみる' }),
      ).not.toBeInTheDocument();
      expect(region.getByRole('link', { name: '解説を読む' })).toHaveAttribute(
        'href',
        '/library/html-css',
      );
      if (status === 'error') {
        fireEvent.click(region.getByRole('button', { name: '続き位置を再確認する' }));
        expect(retry).toHaveBeenCalledOnce();
      } else expect(region.getByRole('status')).toHaveTextContent('確認しています');
    },
  );

  it.each([
    [
      'in-progress',
      'HTML/CSSの続きから',
      `/courses/html-css/lessons/${lessonId}/slides/${lessonId}-s01`,
    ],
    ['complete', '完成したHTML/CSSを見直す', '/courses/html-css'],
    ['revision-mismatch', '教材の更新を確認して続ける', '/courses/html-css'],
  ])('%sの正規の再開先と案内を一致させる', async (status, label, destination) => {
    const progress: CourseProgress = {
      courseId: course.id,
      contentRevision: status === 'revision-mismatch' ? 'old-revision' : course.revision,
      lessons:
        status === 'complete'
          ? {
              [lessonId]: {
                lessonId,
                viewedSlideIds: [],
                passedExerciseIds: [],
                passedChecklistItemIds: [],
                passedRuleIds: [],
                passedViewportIds: [],
                currentComplete: true,
              },
            }
          : {},
      currentLessonId: lessonId,
      currentComplete: status === 'complete',
      updatedAt: '2026-09-27T00:00:00.000Z',
    };
    hooks.progress.mockReturnValue({ status: 'ready', progress, error: undefined, retry });
    const region = within(await renderHome());
    expect(region.getByRole('link', { name: label })).toHaveAttribute('href', destination);
    expect(region.queryByText('目安10分')).not.toBeInTheDocument();
  });

  it('編集非対応では読書を主要操作にし、PC演習との違いを説明する', async () => {
    hooks.editable.mockReturnValue(false);
    const region = within(await renderHome());
    expect(region.getByRole('link', { name: '解説を読む' })).toHaveAttribute(
      'href',
      '/library/html-css',
    );
    expect(
      region.queryByRole('link', { name: '見出しと背景色を変えてみる' }),
    ).not.toBeInTheDocument();
    expect(region.getByText(/コードを変える演習はPC/u)).toBeInTheDocument();
  });
});
