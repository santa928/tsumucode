import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCatalog, fixtureCourse } from '../../../tests/fixtures/course';
import type { CourseProgress } from '../../core/persistence/contracts';
import { HomePage } from './HomePage';

const useCourseProgress = vi.hoisted(() => vi.fn());

vi.mock('../progress/useCourseProgress', () => ({ useCourseProgress }));

vi.mock('../progress/ProgressTransferPanel', () => ({
  ProgressTransferPanel: () => <section aria-label="端末データPanel">端末データを管理</section>,
}));

describe('HomePage', () => {
  beforeEach(() => {
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: undefined,
      error: undefined,
      retry: vi.fn(),
    });
  });

  it('公開Courseの対象者・時間・開始導線を工房の棚として表示する', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        loader: () => ({ catalog: fixtureCatalog, publishedCourses: [fixtureCourse] }),
        HydrateFallback: () => <p>教材を準備中</p>,
        element: <HomePage />,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: '学びたいピースを選ぶ' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '端末データPanel' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '次に積む教材' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: fixtureCatalog.courses[0]!.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(fixtureCatalog.courses[0]!.audience)).toBeInTheDocument();
    expect(screen.getByText('15分')).toBeInTheDocument();
    expect(screen.getByText('公開中')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: `${fixtureCourse.title}の進捗` }),
    ).toHaveAttribute('aria-valuetext', '0 / 1 ピース完了');
    expect(
      screen.getByRole('link', { name: `${fixtureCourse.title}：最初のピースを置く` }),
    ).toHaveAttribute(
      'href',
      '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
    expect(await screen.findByRole('region', { name: '端末データPanel' })).toBeInTheDocument();
  });

  it('保存済みの現在地点をHomeの最優先CTAから再開する', async () => {
    const startedProgress = {
      courseId: fixtureCourse.id,
      contentRevision: fixtureCourse.revision,
      lessons: {},
      currentLessonId: 'lesson-first-heading',
      currentComplete: false,
      updatedAt: '2026-07-16T00:00:00.000Z',
    } satisfies CourseProgress;
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: startedProgress,
      error: undefined,
      retry: vi.fn(),
    });
    const router = createMemoryRouter([
      {
        path: '/',
        loader: () => ({ catalog: fixtureCatalog, publishedCourses: [fixtureCourse] }),
        HydrateFallback: () => <p>教材を準備中</p>,
        element: <HomePage />,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('link', { name: `${fixtureCourse.title}：つづきから` }),
    ).toHaveAttribute(
      'href',
      '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
  });

  it('未公開Courseしかない場合は開始Linkを出さず準備中と伝える', async () => {
    const draftCatalog = {
      ...fixtureCatalog,
      courses: [{ ...fixtureCatalog.courses[0]!, publicationStatus: 'draft' as const }],
    };
    const router = createMemoryRouter([
      {
        path: '/',
        loader: () => ({ catalog: draftCatalog, publishedCourses: [] }),
        HydrateFallback: () => <p>教材を準備中</p>,
        element: <HomePage />,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByText('公開中の教材を準備しています。')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /始める/u })).not.toBeInTheDocument();
  });
});
