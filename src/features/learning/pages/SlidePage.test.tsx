import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { fixtureCourse } from '../../../../tests/fixtures/course';
import type { CourseProgress, VersionedCourseProgress } from '../../../core/persistence/contracts';
import { SlidePage } from './SlidePage';

const runtime = vi.hoisted(() => ({
  repository: {
    getCourseVersioned: vi.fn<(courseId: string) => Promise<VersionedCourseProgress>>(),
    putCourseVersioned:
      vi.fn<(progress: CourseProgress, expectedVersion: number) => Promise<number>>(),
  },
  notices: {
    reportError: vi.fn(),
    dismiss: vi.fn(),
  },
  runCourseProgressMutation: async <Result,>(
    _courseId: string,
    mutation: () => Promise<Result>,
  ): Promise<Result> => mutation(),
}));

vi.mock('../runtimeServices', () => ({
  learningRuntimeServices: {
    repository: runtime.repository,
    notices: runtime.notices,
    runCourseProgressMutation: runtime.runCourseProgressMutation,
    ready: Promise.resolve(),
  },
}));

const course = structuredClone(fixtureCourse);
const lesson = course.phases[0]!.chapters[0]!.lessons[0]!;
lesson.slides.push({
  ...structuredClone(lesson.slides[0]!),
  id: 'slide-second',
  title: '次の説明',
  concept: 'HTML要素',
  blocks: [{ type: 'paragraph', text: '開始タグと終了タグで内容を囲みます。' }],
});

/** Memory Routerの初期Loader完了まで、Test上も明示的な待機表示を返す。 */
function TestLoadingState() {
  return <p>スライドを準備中</p>;
}

/** 各Testで編集可否を固定し、実Routeと同じLoader dataを持つMemory Routerを表示する。 */
function renderSlide(slideId: string, canEdit: boolean, onRender?: ProfilerOnRenderCallback) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: canEdit,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const router = createMemoryRouter(
    [
      {
        path: '/courses/:courseId/lessons/:lessonId/slides/:slideId',
        loader: ({ params }) => ({
          course,
          lesson,
          slide: lesson.slides.find(({ id }) => id === params.slideId)!,
        }),
        HydrateFallback: TestLoadingState,
        element:
          onRender === undefined ? (
            <SlidePage />
          ) : (
            <Profiler id="slide-page" onRender={onRender}>
              <SlidePage />
            </Profiler>
          ),
      },
    ],
    {
      initialEntries: [`/courses/html-css/lessons/lesson-first-heading/slides/${slideId}`],
    },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  runtime.repository.getCourseVersioned.mockReset().mockResolvedValue({ version: 0 });
  runtime.repository.putCourseVersioned.mockReset().mockResolvedValue(1);
  runtime.notices.reportError.mockReset();
  runtime.notices.dismiss.mockReset();
});

describe('SlidePage', () => {
  it('一覧をDrawerで開き、前後導線と左右Arrowで往復して見出しへFocusする', async () => {
    const router = renderSlide('slide-second', true);

    const secondTitle = await screen.findByRole('heading', { level: 1, name: '次の説明' });
    expect(secondTitle).not.toHaveFocus();
    expect(
      screen.queryByRole('complementary', { name: 'スライド部品トレイ' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '学習ツール' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TsumuCodeホームへ' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('progressbar', { name: 'スライドの現在位置' })).toHaveAttribute(
      'aria-valuetext',
      '2 / 2 ピース完了',
    );

    await userEvent.click(screen.getByRole('button', { name: 'スライド一覧を開く' }));
    const drawer = screen.getByRole('dialog', { name: 'スライド一覧' });
    expect(within(drawer).getByRole('navigation', { name: 'スライド一覧' })).toBeVisible();
    expect(within(drawer).getByRole('link', { name: '2. 次の説明' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await userEvent.click(within(drawer).getByRole('button', { name: '閉じる' }));
    expect(screen.getByRole('link', { name: '← 前のスライドへ' })).toHaveAttribute(
      'href',
      '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
    expect(
      screen.getByRole('link', { name: '「h1見出しを追加する」のコード演習を始める' }),
    ).toHaveAttribute(
      'href',
      '/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading',
    );

    await userEvent.keyboard('{ArrowLeft}');
    const firstTitle = await screen.findByRole('heading', {
      level: 1,
      name: 'HTMLは意味を伝える',
    });
    expect(router.state.location.pathname).toMatch(/\/slides\/slide-html-role$/u);
    expect(firstTitle).toHaveFocus();
    expect(screen.getByText('最初のスライドです')).toHaveAttribute('aria-disabled', 'true');

    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/\/slides\/slide-second$/u);
    });
    expect(await screen.findByRole('heading', { level: 1, name: '次の説明' })).toHaveFocus();
  });

  it('入力・横スクロール・修飾済みのArrowではスライドを移動しない', async () => {
    const router = renderSlide('slide-second', true);
    await screen.findByRole('heading', { level: 1, name: '次の説明' });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(router.state.location.pathname).toMatch(/\/slides\/slide-second$/u);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true }));
    });
    expect(router.state.location.pathname).toMatch(/\/slides\/slide-second$/u);
    input.remove();

    const codeRegion = document.createElement('pre');
    codeRegion.tabIndex = 0;
    codeRegion.dataset.slideHorizontalScroll = '';
    document.body.append(codeRegion);
    codeRegion.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(router.state.location.pathname).toMatch(/\/slides\/slide-second$/u);
    codeRegion.remove();

    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.tabIndex = 0;
    document.body.append(editable);
    editable.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(router.state.location.pathname).toMatch(/\/slides\/slide-second$/u);
    editable.remove();

    const prevented = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    prevented.preventDefault();
    window.dispatchEvent(prevented);
    expect(router.state.location.pathname).toMatch(/\/slides\/slide-second$/u);
  });

  it('最後のスライドを編集可能な環境でExerciseへ接続する', async () => {
    renderSlide('slide-second', true);

    expect(
      await screen.findByRole('link', { name: '「h1見出しを追加する」のコード演習を始める' }),
    ).toHaveAttribute(
      'href',
      '/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading',
    );
    expect(screen.queryByText(/今回のピース/u)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/コードを書いて、結果をプレビューしながら確認できます/u),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/次の実装工程/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '演習はPCで積み上げよう' }),
    ).not.toBeInTheDocument();
  });

  it('閲覧Slideを進捗へ保存し、失敗時は常設Noticeへ渡す', async () => {
    runtime.repository.putCourseVersioned.mockRejectedValueOnce(new Error('quota'));
    renderSlide('slide-second', true);

    await screen.findByRole('heading', { level: 1, name: '次の説明' });
    await waitFor(() => {
      expect(runtime.repository.getCourseVersioned).toHaveBeenCalledWith(fixtureCourse.id);
      const [saved, expectedVersion] = runtime.repository.putCourseVersioned.mock.calls[0] ?? [];
      expect(expectedVersion).toBe(0);
      expect(saved?.courseId).toBe(fixtureCourse.id);
      expect(saved?.lessons['lesson-first-heading']).toMatchObject({
        currentSlideId: 'slide-second',
        viewedSlideIds: ['slide-second'],
      });
      expect(runtime.notices.reportError).toHaveBeenCalledWith('slide-progress', expect.any(Error));
    });
  });

  it('非表示の保存中状態ではSlide本文を再描画しない', async () => {
    let finishSave: (() => void) | undefined;
    runtime.repository.putCourseVersioned.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        finishSave = () => {
          resolve(1);
        };
      }),
    );
    const phases: string[] = [];
    renderSlide('slide-second', true, (_id, phase) => {
      phases.push(phase);
    });

    await screen.findByRole('heading', { level: 1, name: '次の説明' });
    await waitFor(() => {
      expect(runtime.repository.putCourseVersioned).toHaveBeenCalledOnce();
    });

    expect(phases).toEqual(['mount']);
    finishSave?.();
  });

  it('Slide進捗の保存失敗をinline表示し、同じSlideから明示的に再保存できる', async () => {
    runtime.repository.putCourseVersioned
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce(1);
    renderSlide('slide-second', true);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'このスライドの閲覧進捗を保存できませんでした',
    );
    const retry = screen.getByRole('button', { name: '閲覧進捗をもう一度保存' });
    expect(retry).toBeEnabled();

    await userEvent.click(retry);

    await waitFor(() => {
      expect(runtime.repository.putCourseVersioned).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(runtime.notices.dismiss).toHaveBeenCalledWith('error:slide-progress');
  });

  it('編集不能環境でも本文を隠さず、PCが必要な理由とCourse Map導線を示す', async () => {
    renderSlide('slide-second', false);

    expect(await screen.findByText('開始タグと終了タグで内容を囲みます。')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '演習はPCで積み上げよう' })).toBeInTheDocument();
    expect(screen.getByText(/幅1024px以上/u)).toBeInTheDocument();
    const pager = screen.getByRole('navigation', { name: 'スライド移動' });
    expect(within(pager).getByRole('link', { name: 'コースマップへ戻る' })).toHaveAttribute(
      'href',
      '/courses/html-css',
    );
    await userEvent.click(screen.getByRole('button', { name: '用語を開く' }));
    const glossaryDrawer = screen.getByRole('dialog', { name: 'このレッスンの用語' });
    expect(glossaryDrawer).toBeVisible();
    expect(within(glossaryDrawer).getByText('Webページの意味と構造を表す言語')).toBeVisible();
  });
});
