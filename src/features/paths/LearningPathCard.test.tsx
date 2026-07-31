/** Home用LearningPath cardの進捗・CTA・失敗状態を検証する。 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCatalog } from '../../../tests/fixtures/course';
import { LearningPathCard } from './LearningPathCard';

const useLearningPathProgress = vi.hoisted(() => vi.fn());

vi.mock('../progress/useLearningPathProgress', () => ({ useLearningPathProgress }));

const path = fixtureCatalog.learningPaths[0]!;
const courses = [fixtureCatalog.courses[0]!];

describe('LearningPathCard', () => {
  beforeEach(() => {
    useLearningPathProgress.mockReset();
  });

  it('required Course数・進捗・最初の未完了requiredへのCTAを表示する', () => {
    useLearningPathProgress.mockReturnValue({
      status: 'ready',
      summary: {
        status: 'not-started',
        completedRequiredCourses: 0,
        totalRequiredCourses: 1,
        actionPath: '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
        steps: [],
      },
      retry: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LearningPathCard path={path} courses={courses} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 3, name: path.title })).toBeInTheDocument();
    expect(screen.getByText('必須コース 1件')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: `${path.title}の進捗` })).toHaveAttribute(
      'aria-valuetext',
      '0 / 1 ピース完了',
    );
    expect(screen.getByRole('link', { name: `「${path.title}」を最初から始める` })).toHaveAttribute(
      'href',
      '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
    expect(screen.getByRole('link', { name: `${path.title}の全体を見る` })).toHaveAttribute(
      'href',
      '/paths/frontend',
    );
  });

  it.each([
    ['in-progress', `「${path.title}」のつづきから`],
    ['complete', `「${path.title}」を見直す`],
  ] as const)('%sのCTA文言を表示する', (status, label) => {
    useLearningPathProgress.mockReturnValue({
      status: 'ready',
      summary: {
        status,
        completedRequiredCourses: status === 'complete' ? 1 : 0,
        totalRequiredCourses: 1,
        actionPath: status === 'complete' ? '/paths/frontend' : '/courses/html-css',
        steps: [],
      },
      retry: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LearningPathCard path={path} courses={courses} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  });

  it('読込失敗をsafeな案内とretryで表示する', async () => {
    const retry = vi.fn();
    useLearningPathProgress.mockReturnValue({
      status: 'error',
      error: '学習パスの進捗を読み込めませんでした。',
      retry,
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LearningPathCard path={path} courses={courses} />
      </MemoryRouter>,
    );

    expect(screen.getByText('進捗を読み込めませんでした')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '学習パス進捗を再試行' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
