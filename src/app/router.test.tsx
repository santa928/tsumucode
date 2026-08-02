import { RouterProvider } from 'react-router/dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureCatalog,
  fixtureCourse,
  fixtureCourseIndex,
  fixtureLessonManifest,
} from '../../tests/fixtures/course';
import { courseContentRepository } from '../core/content/CourseContentRepository';
import type * as LoadCourseCatalogModule from '../core/content/loadCourseCatalog';
import { createAppRouter } from './router';

const content = vi.hoisted(() => ({
  loadCourseCatalog: vi.fn(),
  loadCourseIndex: vi.fn(),
  loadLessonManifest: vi.fn(),
}));

vi.mock('../core/content/loadCourseCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof LoadCourseCatalogModule>();
  return {
    ...actual,
    loadCourseCatalog: content.loadCourseCatalog,
    loadCourseIndex: content.loadCourseIndex,
    loadLessonManifest: content.loadLessonManifest,
  };
});

const runtime = vi.hoisted(() => {
  const emptyNotices: readonly unknown[] = [];
  const healthyPersistence = { kind: 'healthy' as const, hasUnsavedChanges: false };
  return {
    ensureCourseIndex: vi.fn(async () => []),
    repository: {
      getCourse: vi.fn(async () => undefined),
      putCourse: vi.fn(async () => undefined),
      getDraft: vi.fn(async () => undefined),
      snapshot: vi.fn(async () => ({
        schemaVersion: 2,
        courses: {},
        drafts: {},
        quarantined: [],
      })),
      createBackup: vi.fn(),
      replaceSnapshot: vi.fn(),
    },
    progressService: {
      getHealthSnapshot: () => healthyPersistence,
      subscribeHealth: () => () => undefined,
    },
    transferService: {
      exportAll: vi.fn(async () => '{}'),
      prepareImport: vi.fn(),
      applyImport: vi.fn(),
      discardImport: vi.fn(() => true),
    },
    prepareTransferCatalog: vi.fn(async () => undefined),
    retryPersistence: vi.fn(async () => ({ kind: 'recovered' as const })),
    resolvePersistenceConflict: vi.fn(async () => undefined),
    passFreshness: { isDirty: vi.fn(() => false) },
    runnerRegistry: { create: vi.fn() },
    readOnlyPreviewRegistry: { create: vi.fn() },
    notices: {
      getSnapshot: () => emptyNotices,
      subscribe: () => () => undefined,
      reportError: vi.fn(),
      dismiss: vi.fn(),
    },
    runCourseProgressMutation: async <Result,>(
      _courseId: string,
      mutation: () => Promise<Result>,
    ): Promise<Result> => mutation(),
  };
});

vi.mock('../features/learning/runtimeServices', () => ({
  learningRuntimeServices: {
    ...runtime,
    ready: Promise.resolve(),
  },
}));

const originalHash = window.location.hash;
let router: ReturnType<typeof createAppRouter> | undefined;

/** 全suite負荷でも動的importを含むRouter初期化を待てる上限。 */
const ROUTER_READY_TIMEOUT_MS = 5_000;

beforeEach(() => {
  content.loadCourseCatalog.mockReset().mockResolvedValue(structuredClone(fixtureCatalog));
  content.loadCourseIndex.mockReset().mockResolvedValue(structuredClone(fixtureCourseIndex));
  content.loadLessonManifest.mockReset().mockResolvedValue(structuredClone(fixtureLessonManifest));
  vi.spyOn(courseContentRepository, 'loadWorkspaceLessons').mockResolvedValue([
    structuredClone(fixtureLessonManifest),
  ]);
  vi.spyOn(courseContentRepository, 'prefetchLesson').mockResolvedValue();
  runtime.ensureCourseIndex.mockClear();
  runtime.repository.getCourse.mockClear();
  runtime.repository.putCourse.mockClear();
  runtime.repository.getDraft.mockClear();
});

afterEach(() => {
  router?.dispose();
  router = undefined;
  window.location.hash = originalHash;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createAppRouter', () => {
  it('Library目次へ直接アクセスし、通常学習Runtimeへ触れず全Slide入口を表示する', async () => {
    window.location.hash = '#/library/html-css';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: `${fixtureCourse.title} スライド目次`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '見出しを置くを先頭から見る' })).toHaveAttribute(
      'href',
      '#/library/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
    expect(router.state.location.pathname).toBe('/library/html-css');
    expect(runtime.ensureCourseIndex).not.toHaveBeenCalled();
    expect(runtime.repository.getCourse).not.toHaveBeenCalled();
    expect(runtime.repository.getDraft).not.toHaveBeenCalled();
  });

  it('Library Viewerへ直接アクセスし、Hashを維持して対象Slideを表示する', async () => {
    window.location.hash = '#/library/html-css/lessons/lesson-first-heading/slides/slide-html-role';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('閲覧モード')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'HTMLは意味を伝える' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      '/library/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
    expect(runtime.ensureCourseIndex).not.toHaveBeenCalled();
    expect(runtime.repository.getCourse).not.toHaveBeenCalled();
    expect(runtime.repository.getDraft).not.toHaveBeenCalled();
  });

  it('未知のLibrary Courseを既存の再試行可能な404画面で受け止める', async () => {
    window.location.hash = '#/library/missing-course';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { name: '教材を読み込めませんでした' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'もう一度読み込む' })).toBeEnabled();
    expect(runtime.ensureCourseIndex).not.toHaveBeenCalled();
  });

  it('Hash RouterのHome routeを表示する', async () => {
    window.location.hash = '#/';
    router = createAppRouter();
    render(<RouterProvider router={router} />);
    await waitFor(
      () => {
        expect(screen.getByRole('heading', { name: '学びたいピースを選ぶ' })).toBeInTheDocument();
      },
      { timeout: ROUTER_READY_TIMEOUT_MS },
    );
  });

  it('Catalog取得中を通知してからHomeへ遷移する', async () => {
    let resolveFetch!: () => void;
    const pendingFetch = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });
    content.loadCourseCatalog.mockImplementation(async () => {
      await pendingFetch;
      return structuredClone(fixtureCatalog);
    });
    window.location.hash = '#/';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    const loadingTitle = await screen.findByRole(
      'heading',
      {
        name: '教材のピースを並べています',
      },
      { timeout: ROUTER_READY_TIMEOUT_MS },
    );
    expect(loadingTitle.closest('section')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('学習工房を準備しています');

    await act(async () => {
      resolveFetch();
      await pendingFetch;
    });
    expect(
      await screen.findByRole(
        'heading',
        { name: '学びたいピースを選ぶ' },
        { timeout: ROUTER_READY_TIMEOUT_MS },
      ),
    ).toBeInTheDocument();
  });

  it('Catalog取得失敗を再試行可能な画面へ変換する', async () => {
    content.loadCourseCatalog.mockRejectedValue(new Error('offline'));
    window.location.hash = '#/';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { name: '教材を読み込めませんでした' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'もう一度読み込む' })).toBeEnabled();
  });

  it('LearningPath URLへ直接アクセスしてPath詳細を表示する', async () => {
    window.location.hash = '#/paths/frontend';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: fixtureCatalog.learningPaths[0]!.title,
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/paths/frontend');
  });

  it('Course URLへ直接アクセスして検証済みコースマップを表示する', async () => {
    window.location.hash = '#/courses/html-css';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: fixtureCourse.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '見出しを置くレッスンを始める' })).toHaveAttribute(
      'href',
      '#/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
  });

  it('Course取得中を通知してからコースマップへ遷移する', async () => {
    let resolveCatalog!: () => void;
    const pendingCatalog = new Promise<void>((resolve) => {
      resolveCatalog = resolve;
    });
    content.loadCourseCatalog.mockImplementation(async () => {
      await pendingCatalog;
      return structuredClone(fixtureCatalog);
    });
    window.location.hash = '#/courses/html-css';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: '教材のピースを並べています' }),
    ).toBeInTheDocument();

    await act(async () => {
      resolveCatalog();
      await pendingCatalog;
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: fixtureCourse.title }),
    ).toBeInTheDocument();
  });

  it('Slide URLへ直接アクセスして検証済み教材本文を表示する', async () => {
    window.location.hash = '#/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'HTMLは意味を伝える' }),
    ).toBeInTheDocument();
    expect(screen.getByText('HTMLはページの意味と構造を表します。')).toBeInTheDocument();
  });

  it('Exercise URLは404にせず端末条件付きのPC案内で受け止める', async () => {
    window.location.hash =
      '#/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading';
    router = createAppRouter();
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'PCで演習を開く' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/幅1024px以上/u)).toBeInTheDocument();
  });
});
