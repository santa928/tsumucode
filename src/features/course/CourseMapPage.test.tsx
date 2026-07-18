import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCourse } from '../../../tests/fixtures/course';
import type { CourseProgress } from '../../core/persistence/contracts';
import { CourseMapPage } from './CourseMapPage';

const useCourseProgress = vi.hoisted(() => vi.fn());

vi.mock('../progress/useCourseProgress', () => ({ useCourseProgress }));

const NOW = '2026-07-10T00:00:00.000Z';

const completedProgress = {
  courseId: fixtureCourse.id,
  contentRevision: fixtureCourse.revision,
  lessons: {
    'lesson-first-heading': {
      lessonId: 'lesson-first-heading',
      viewedSlideIds: ['slide-html-role'],
      passedExerciseIds: ['exercise-first-heading'],
      passedChecklistItemIds: [],
      passedRuleIds: ['rule-h1-exists'],
      passedViewportIds: ['desktop'],
      currentComplete: true,
      firstCompletedAt: NOW,
    },
  },
  currentComplete: true,
  firstCompletedAt: NOW,
  updatedAt: NOW,
} satisfies CourseProgress;

/** Course Map routeを指定教材で描画する。 */
function renderCourseMap(course = fixtureCourse) {
  const router = createMemoryRouter(
    [
      {
        path: '/courses/:courseId',
        loader: () => course,
        HydrateFallback: () => <p>教材を準備中</p>,
        element: <CourseMapPage />,
      },
    ],
    { initialEntries: ['/courses/html-css'] },
  );

  render(<RouterProvider router={router} />);
}

describe('CourseMapPage', () => {
  beforeEach(() => {
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: undefined,
      error: undefined,
      retry: vi.fn(),
    });
  });

  it('Course、Phase、Chapter、Lessonを省略しない見出し階層で表示する', async () => {
    renderCourseMap();

    expect(
      await screen.findByRole('heading', { level: 1, name: fixtureCourse.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '最初のピース' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Web制作の地図' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: '見出しを置く' })).toBeInTheDocument();
    expect(screen.getByTestId('course-progress-status')).toHaveClass('min-h-6');
  });

  it('現在地、所要時間、自然な名前の開始Linkを文字で伝える', async () => {
    renderCourseMap();

    expect(await screen.findByText('現在のピース')).toHaveAttribute('data-status', 'current');
    expect(screen.getByText('全1章・約15分')).toBeInTheDocument();
    expect(screen.getByText('15分', { selector: '[data-lesson-minutes]' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '見出しを置くレッスンを始める' })).toHaveAttribute(
      'href',
      '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
  });

  it('端末進捗から完了数とLesson状態を表示する', async () => {
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: completedProgress,
      error: undefined,
      retry: vi.fn(),
    });
    renderCourseMap();

    expect(await screen.findByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByText('完了')).toHaveAttribute('data-status', 'complete');
    expect(screen.getByRole('progressbar', { name: 'コース進捗' })).toHaveAttribute(
      'aria-valuetext',
      '1 / 1 ピース完了',
    );
  });

  it('読込中をstatusで伝え、0件Courseでもprogressのmaxを正に保つ', async () => {
    useCourseProgress.mockReturnValue({
      status: 'loading',
      progress: undefined,
      error: undefined,
      retry: vi.fn(),
    });
    renderCourseMap({
      ...fixtureCourse,
      phases: [],
      expectedTotals: {
        ...fixtureCourse.expectedTotals,
        chapters: 0,
        lessons: 0,
        conceptSlides: 0,
        standardExercises: 0,
        estimatedMinutes: 0,
      },
      estimatedMinutes: 0,
    });

    expect(await screen.findByRole('status')).toHaveTextContent('端末のコース進捗を確認しています');
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'コース進捗' })).toHaveAttribute('value', '0');
    expect(screen.getByRole('progressbar', { name: 'コース進捗' })).toHaveAttribute('max', '1');
  });

  it('読込失敗をalertで伝え、再試行操作をHookへ渡す', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    useCourseProgress.mockReturnValue({
      status: 'error',
      progress: undefined,
      error: 'コース進捗を読み込めませんでした。',
      retry,
    });
    renderCourseMap();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'コース進捗を読み込めませんでした。',
    );
    await user.click(screen.getByRole('button', { name: 'コース進捗を再試行' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
