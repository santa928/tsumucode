/** LearningPath詳細のStep順・自由なCourse導線・進捗失敗状態を検証する。 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCatalog } from '../../../tests/fixtures/course';
import type { CourseCatalogEntry, LearningPathDefinition } from '../../core/content/types';
import type { LearningPathProgressSummary } from '../progress/learningPathProgress';
import { LearningPathPage } from './LearningPathPage';

const useLearningPathProgress = vi.hoisted(() => vi.fn());

vi.mock('../progress/useLearningPathProgress', () => ({ useLearningPathProgress }));

/** HTML/CSS、recommended Tailwind、required JavaScriptのPath表示fixtureを作る。 */
function pageFixture(): {
  readonly path: LearningPathDefinition;
  readonly courses: readonly CourseCatalogEntry[];
  readonly summary: LearningPathProgressSummary;
} {
  const html = structuredClone(fixtureCatalog.courses[0]!);
  const tailwind: CourseCatalogEntry = {
    ...structuredClone(html),
    id: 'tailwind',
    title: 'Tailwind CSS',
    description: 'Utility classで見た目を組み立てる',
    revision: '2026-07-31.tailwind',
    indexPath: 'generated/content/courses/tailwind/index.json',
    indexSha256: 'b'.repeat(64),
    lessonStarts: [
      {
        lessonId: 'tailwind-utilities',
        target: { kind: 'slide', targetId: 'tailwind-utilities-intro' },
      },
    ],
  };
  const javascript: CourseCatalogEntry = {
    ...structuredClone(html),
    id: 'javascript',
    title: 'JavaScript',
    description: 'ページへ動きを加える',
    revision: '2026-07-31.javascript',
    indexPath: 'generated/content/courses/javascript/index.json',
    indexSha256: 'c'.repeat(64),
    lessonStarts: [
      { lessonId: 'js-values', target: { kind: 'slide', targetId: 'js-values-intro' } },
    ],
  };
  const path: LearningPathDefinition = {
    ...structuredClone(fixtureCatalog.learningPaths[0]!),
    steps: [
      { courseId: html.id, role: 'required', prerequisiteCourseIds: [] },
      {
        courseId: tailwind.id,
        role: 'recommended',
        prerequisiteCourseIds: [html.id],
      },
      {
        courseId: javascript.id,
        role: 'required',
        prerequisiteCourseIds: [html.id],
      },
    ],
  };
  const summary: LearningPathProgressSummary = {
    status: 'in-progress',
    completedRequiredCourses: 1,
    totalRequiredCourses: 2,
    actionPath: '/courses/javascript/lessons/js-values/slides/js-values-intro',
    steps: [
      {
        course: html,
        role: 'required',
        prerequisiteCourseIds: [],
        courseProgress: {
          status: 'complete',
          completedLessons: 1,
          totalLessons: 1,
          actionPath: '/courses/html-css',
        },
      },
      {
        course: tailwind,
        role: 'recommended',
        prerequisiteCourseIds: [html.id],
        courseProgress: {
          status: 'not-started',
          completedLessons: 0,
          totalLessons: 1,
          actionPath:
            '/courses/tailwind/lessons/tailwind-utilities/slides/tailwind-utilities-intro',
          currentLessonId: 'tailwind-utilities',
        },
      },
      {
        course: javascript,
        role: 'required',
        prerequisiteCourseIds: [html.id],
        courseProgress: {
          status: 'not-started',
          completedLessons: 0,
          totalLessons: 1,
          actionPath: '/courses/javascript/lessons/js-values/slides/js-values-intro',
          currentLessonId: 'js-values',
        },
      },
    ],
  };
  return { path, courses: [html, tailwind, javascript], summary };
}

/** Loader data付きのPath詳細Routeを描画する。 */
function renderPage(data: ReturnType<typeof pageFixture>): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter(
    [
      {
        path: '/paths/:pathId',
        loader: () => ({ path: data.path, courses: data.courses }),
        element: <LearningPathPage />,
        HydrateFallback: () => <p>学習パスを準備中</p>,
      },
    ],
    { initialEntries: ['/paths/frontend'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('LearningPathPage', () => {
  beforeEach(() => {
    useLearningPathProgress.mockReset();
  });

  it('Step順・必須／選択・前提Course名と常時利用できる直接Linkを表示する', async () => {
    const data = pageFixture();
    useLearningPathProgress.mockReturnValue({
      status: 'ready',
      summary: data.summary,
      retry: vi.fn(),
    });

    renderPage(data);

    expect(
      await screen.findByRole('heading', { level: 1, name: data.path.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '公開済みのコースから順に学べます。新しい教材は完成後にこのパスへ追加されます。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: `「${data.path.title}」のつづきから` }),
    ).toHaveAttribute('href', '/courses/javascript/lessons/js-values/slides/js-values-intro');

    const list = screen.getByRole('list', { name: '学習パスのコース順' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'HTML/CSS はじめの一歩',
      'Tailwind CSS',
      'JavaScript',
    ]);
    expect(within(items[0]!).getByText('必須')).toBeInTheDocument();
    expect(within(items[1]!).getByText('選択')).toBeInTheDocument();
    expect(within(items[1]!).getByText('前提コース：HTML/CSS はじめの一歩')).toBeInTheDocument();
    expect(within(items[2]!).getByText('前提コース：HTML/CSS はじめの一歩')).toBeInTheDocument();
    expect(within(items[1]!).getByRole('link', { name: 'Tailwind CSSを始める' })).toBeEnabled();
    expect(within(items[2]!).getByRole('link', { name: 'JavaScriptを始める' })).toBeEnabled();
    expect(list.querySelector('[aria-disabled="true"]')).toBeNull();
    expect(list.querySelector(':disabled')).toBeNull();
    expect(
      within(items[2]!).getByRole('link', { name: 'JavaScript：スライドだけ見る' }),
    ).toHaveAttribute('href', '/library/javascript');
  });

  it('recommended未完了でもrequired Courseの主要CTAを維持する', async () => {
    const data = pageFixture();
    useLearningPathProgress.mockReturnValue({
      status: 'ready',
      summary: data.summary,
      retry: vi.fn(),
    });

    renderPage(data);

    expect(
      await screen.findByRole('link', { name: `「${data.path.title}」のつづきから` }),
    ).toHaveAttribute('href', '/courses/javascript/lessons/js-values/slides/js-values-intro');
  });

  it('進捗読込失敗を案内しretryできる', async () => {
    const data = pageFixture();
    const retry = vi.fn();
    useLearningPathProgress.mockReturnValue({
      status: 'error',
      error: '学習パスの進捗を読み込めませんでした。',
      retry,
    });
    const user = userEvent.setup();

    renderPage(data);

    expect(await screen.findByText('進捗を読み込めませんでした')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '学習パス進捗を再試行' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
