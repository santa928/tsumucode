import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { fixtureCourse, fixtureCourseIndex } from '../../../tests/fixtures/course';
import type { CourseIndex, CourseManifest, Lesson, Slide } from '../../core/content/types';
import { resolveCourseSlideOutlineContext } from './courseSlideSequence';
import { LibrarySlidePage } from './LibrarySlidePage';

/** Fixture SlideをViewer Test用の永続IDと題名へ複製する。 */
function createSlide(source: Slide, id: string, title: string): Slide {
  return { ...structuredClone(source), id, title };
}

/** Fixture Lessonを任意のSlide列で複製する。 */
function createLesson(source: Lesson, id: string, title: string, slides: readonly Slide[]): Lesson {
  if (source.kind !== 'standard') throw new Error('Fixture Lessonがstandardではありません');
  return {
    ...structuredClone(source),
    id,
    title,
    slides: [...slides],
    completion: { ...source.completion, finalSlideId: slides.at(-1)!.id },
  };
}

/** 2 Lesson／3 Slideの境界移動用Courseを作る。 */
function createViewerCourse(): CourseManifest {
  const course = structuredClone(fixtureCourse);
  const chapter = course.phases[0]!.chapters[0]!;
  const sourceLesson = chapter.lessons[0]!;
  const sourceSlide = sourceLesson.slides[0]!;
  chapter.lessons = [
    createLesson(sourceLesson, 'lesson-a', 'Lesson A', [
      createSlide(sourceSlide, 'slide-a-1', 'Aのはじめ'),
      createSlide(sourceSlide, 'slide-a-2', 'Aのまとめ'),
    ]),
    createLesson(sourceLesson, 'lesson-b', 'Lesson B', [
      createSlide(sourceSlide, 'slide-b-1', 'Bのはじめ'),
    ]),
  ];
  return course;
}

/** Viewer専用Courseから本文を持たない移動用Indexを投影する。 */
function createViewerIndex(course: CourseManifest): CourseIndex {
  return {
    ...structuredClone(fixtureCourseIndex),
    phases: course.phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      description: phase.description,
      chapters: phase.chapters.map((chapter) => ({
        id: chapter.id,
        sequence: chapter.sequence,
        title: chapter.title,
        goal: chapter.goal,
        estimatedMinutes: chapter.estimatedMinutes,
        kind: chapter.kind,
        lessons: chapter.lessons.map((lesson) => {
          if (lesson.kind !== 'standard') throw new Error('Viewer fixtureはstandardだけです');
          return {
            id: lesson.id,
            kind: lesson.kind,
            title: lesson.title,
            goal: lesson.goal,
            estimatedMinutes: lesson.estimatedMinutes,
            prerequisiteLessonIds: lesson.prerequisiteLessonIds,
            slides: lesson.slides.map(({ id, title, kind }) => ({ id, title, kind })),
            exercises: lesson.exercises.map(({ id, title, kind, workspaceId }) => ({
              id,
              title,
              kind,
              workspaceId,
            })),
            completion: lesson.completion,
            manifestPath: `generated/content/courses/${course.id}/lessons/${lesson.id}.json`,
            manifestSha256: 'a'.repeat(64),
          };
        }),
      })),
    })),
  };
}

/** 実Loaderと同じSlide Contextを解決するMemory RouterでViewerを表示する。 */
function renderLibrarySlide(slideId: string) {
  const course = createViewerCourse();
  const index = createViewerIndex(course);
  const route = '/library/:courseId/lessons/:lessonId/slides/:slideId';
  const router = createMemoryRouter(
    [
      {
        path: route,
        loader: ({ params }) => {
          const context = resolveCourseSlideOutlineContext(
            index,
            params.lessonId ?? '',
            params.slideId ?? '',
          );
          const lesson = course.phases
            .flatMap(({ chapters }) => chapters)
            .flatMap(({ lessons }) => lessons)
            .find(({ id }) => id === context.current.lesson.id)!;
          const slide = lesson.slides.find(({ id }) => id === context.current.slide.id)!;
          return { course: index, context, lesson, slide };
        },
        HydrateFallback: () => <p>スライドを準備中</p>,
        element: <LibrarySlidePage />,
      },
    ],
    {
      initialEntries: [
        `/library/html-css/lessons/${
          slideId.startsWith('slide-b') ? 'lesson-b' : 'lesson-a'
        }/slides/${slideId}`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('LibrarySlidePage', () => {
  it('進捗UIとExerciseを置かず、Lesson境界を越える前後導線とLibrary内Drawerを表示する', async () => {
    renderLibrarySlide('slide-a-2');

    expect(await screen.findByText('閲覧モード')).toBeInTheDocument();
    expect(screen.getByText('進捗には反映されません')).toBeInTheDocument();
    expect(screen.getByText('Lesson 1 / 2・Slide 2 / 2')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /コード演習/u })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前のスライドへ' })).toHaveAttribute(
      'href',
      '/library/html-css/lessons/lesson-a/slides/slide-a-1',
    );
    expect(screen.getByRole('link', { name: '次のスライドへ' })).toHaveAttribute(
      'href',
      '/library/html-css/lessons/lesson-b/slides/slide-b-1',
    );

    await userEvent.click(screen.getByRole('button', { name: 'スライド目次を開く' }));
    const slideDrawer = screen.getByRole('dialog', { name: 'スライド目次' });
    expect(slideDrawer).toHaveAttribute('data-height-mode', 'viewport');
    const drawerLinks = within(slideDrawer).getAllByRole('link');
    expect(drawerLinks).toHaveLength(3);
    for (const link of drawerLinks) {
      expect(link.getAttribute('href')).toMatch(/^\/library\/html-css\//u);
    }
    expect(within(slideDrawer).getByRole('link', { name: '2. Aのまとめ' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await userEvent.click(within(slideDrawer).getByRole('button', { name: '閉じる' }));

    await userEvent.click(screen.getByRole('button', { name: '用語を開く' }));
    const glossaryDrawer = screen.getByRole('dialog', { name: 'このレッスンの用語' });
    expect(glossaryDrawer).toHaveAttribute('data-height-mode', 'content');
    expect(within(glossaryDrawer).getByText('Webページの意味と構造を表す言語')).toBeVisible();
    expect(screen.getByRole('link', { name: '通常学習へ戻る' })).toHaveAttribute(
      'href',
      '/courses/html-css',
    );
  });

  it('左右Arrowで移動して見出しへFocusし、入力・Dialog・横Scroll中は移動しない', async () => {
    const router = renderLibrarySlide('slide-a-2');
    await screen.findByRole('heading', { level: 1, name: 'Aのまとめ' });

    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/\/lesson-b\/slides\/slide-b-1$/u);
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Bのはじめ' })).toHaveFocus();

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(router.state.location.pathname).toMatch(/\/slide-b-1$/u);
    input.remove();

    await userEvent.click(screen.getByRole('button', { name: 'スライド目次を開く' }));
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(router.state.location.pathname).toMatch(/\/slide-b-1$/u);
    await userEvent.keyboard('{Escape}');

    const horizontalRegion = document.createElement('pre');
    horizontalRegion.tabIndex = 0;
    horizontalRegion.dataset.slideHorizontalScroll = '';
    document.body.append(horizontalRegion);
    horizontalRegion.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(router.state.location.pathname).toMatch(/\/slide-b-1$/u);
    horizontalRegion.remove();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true }));
    });
    expect(router.state.location.pathname).toMatch(/\/slide-b-1$/u);
  });

  it('Course末尾では次のExerciseではなくスライド目次へ戻す', async () => {
    renderLibrarySlide('slide-b-1');

    expect(await screen.findByRole('link', { name: 'スライド目次へ戻る' })).toHaveAttribute(
      'href',
      '/library/html-css',
    );
    expect(screen.queryByRole('link', { name: '次のスライドへ' })).not.toBeInTheDocument();
  });
});
