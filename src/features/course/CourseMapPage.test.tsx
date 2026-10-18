import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCourse } from '../../../tests/fixtures/course';
import type { CourseProgress, ExerciseDraft } from '../../core/persistence/contracts';
import type { CourseIndex, CourseManifest } from '../../core/content/types';
import { profileCompletionFixture } from '../../../tests/fixtures/profileCompletion';
import { CourseMapPage } from './CourseMapPage';

const useCourseProgress = vi.hoisted(() => vi.fn());
const useEditingCapability = vi.hoisted(() => vi.fn());

vi.mock('../progress/useCourseProgress', () => ({ useCourseProgress }));
vi.mock('../../shared/device/editingCapability', () => ({ useEditingCapability }));

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
function renderCourseMap(course: CourseIndex | CourseManifest = fixtureCourse) {
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
  it('共有Profileの工程合格と制作全体の未完了・未合格工程を区別する', async () => {
    const fixture = profileCompletionFixture();
    const unfinished = fixture.manifests.slice(2, 4).map(({ lesson }) => lesson);
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: {
        ...fixture.progress,
        lessons: {
          ...fixture.progress.lessons,
          ...Object.fromEntries(
            unfinished.map(({ id }) => [
              id,
              { ...fixture.progress.lessons[id]!, currentComplete: false, passedExerciseIds: [] },
            ]),
          ),
        },
      },
      drafts: new Map([[fixture.draft.workspaceId, fixture.draft]]),
      error: undefined,
      retry: vi.fn(),
    });
    renderCourseMap(fixture.course);

    expect(await screen.findByText('制作全体は未完了です。')).toBeInTheDocument();
    expect(screen.getAllByText('工程合格')).toHaveLength(3);
    expect(screen.getByText(/未合格の工程：/u)).toHaveTextContent(unfinished[0]!.title);
    expect(screen.getByText(/未合格の工程：/u)).toHaveTextContent(unfinished[1]!.title);
    expect(screen.getByText(/最終工程で全工程をまとめて判定/u)).toBeInTheDocument();
  });

  it('全工程合格でも記録と最終工程での制作完成判定を区別する', async () => {
    const fixture = profileCompletionFixture();
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: fixture.progress,
      drafts: new Map([[fixture.draft.workspaceId, fixture.draft]]),
      error: undefined,
      retry: vi.fn(),
    });
    renderCourseMap(fixture.course);

    expect(await screen.findByText(/全工程に合格記録があります/u)).toBeInTheDocument();
    expect(screen.getAllByText('工程合格')).toHaveLength(5);
    expect(screen.queryByText('制作全体は未完了です。')).not.toBeInTheDocument();
  });

  it('共有workspaceを持たない独立制作へ工程表示を追加しない', async () => {
    const fixture = profileCompletionFixture();
    for (const phase of fixture.course.phases) {
      for (const chapter of phase.chapters) {
        for (const lesson of chapter.lessons) {
          if (lesson.kind !== 'guided-project') continue;
          for (const exercise of lesson.exercises) exercise.workspaceId = exercise.id;
        }
      }
    }
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: fixture.progress,
      error: undefined,
      retry: vi.fn(),
    });
    renderCourseMap(fixture.course);

    expect(await screen.findAllByText('完了')).toHaveLength(5);
    expect(screen.queryByText('工程合格')).not.toBeInTheDocument();
    expect(screen.queryByText(/最終工程で全工程をまとめて判定/u)).not.toBeInTheDocument();
  });

  it('著者の章番号を加算せず表示する', async () => {
    renderCourseMap();
    expect(await screen.findByText(/CHAPTER 00/u)).toBeInTheDocument();
  });

  beforeEach(() => {
    useEditingCapability.mockReturnValue(true);
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: undefined,
      error: undefined,
      retry: vi.fn(),
    });
  });

  it('読書端末では最終Slideを読んだ後も演習ではなく保存した解説へ戻る', async () => {
    useEditingCapability.mockReturnValue(false);
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: {
        ...completedProgress,
        currentComplete: false,
        currentLessonId: 'lesson-first-heading',
        lessons: {
          'lesson-first-heading': {
            ...completedProgress.lessons['lesson-first-heading'],
            currentSlideId: 'slide-html-role',
            passedExerciseIds: [],
            currentComplete: false,
          },
        },
      },
      error: undefined,
      retry: vi.fn(),
    });
    renderCourseMap();

    const link = await screen.findByRole('link', { name: /見出しを置く/u });
    expect(link).toHaveAttribute(
      'href',
      '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
    expect(link).toHaveAccessibleName('見出しを置くの解説を読む');
    expect(screen.getByText(/解説の閲覧位置と、演習の合格記録は別/u)).toBeInTheDocument();
  });

  it('読書端末では制作の解説を開き、Slideのない制作には既存の入口を残す', async () => {
    useEditingCapability.mockReturnValue(false);
    const fixture = profileCompletionFixture();
    const lessons = fixture.course.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons }) => lessons),
    );
    const readingLesson = lessons.find((lesson) => lesson.slides.length > 0)!;
    const noSlideLesson = lessons.find((lesson) => lesson.id !== readingLesson.id)!;
    noSlideLesson.slides = [];
    renderCourseMap(fixture.course);

    expect(
      await screen.findByRole('link', { name: `${readingLesson.title}の解説を読む` }),
    ).toHaveAttribute(
      'href',
      `/courses/${fixture.course.id}/lessons/${readingLesson.id}/slides/${readingLesson.slides[0]!.id}`,
    );
    expect(
      screen.getByRole('link', { name: new RegExp(noSlideLesson.title, 'u') }),
    ).toHaveAttribute(
      'href',
      `/courses/${fixture.course.id}/lessons/${noSlideLesson.id}/exercises/${noSlideLesson.exercises[0]!.id}`,
    );
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
    expect(screen.queryByText(/以前の達成記録は残っています/u)).not.toBeInTheDocument();
  });

  it('進捗が未作成でも保存済みの作業を見つけ、完了を増やさず再開できる', async () => {
    const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
    const exercise = lesson.exercises[0]!;
    const draft: ExerciseDraft = {
      courseId: fixtureCourse.id,
      lessonId: lesson.id,
      exerciseId: exercise.id,
      workspaceId: exercise.workspaceId,
      contentRevision: fixtureCourse.revision,
      editRevision: 1,
      files: { 'index.html': '<main>途中</main>' },
      selectedFile: 'index.html',
      cursors: {},
      validationHistory: [],
      revealedHintIds: [],
      lastPassingSnapshots: {},
      updatedAt: NOW,
    };
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: undefined,
      drafts: new Map([[exercise.workspaceId, draft]]),
      error: undefined,
      retry: vi.fn(),
    });
    renderCourseMap();
    expect(
      await screen.findByRole('link', { name: `${lesson.title}レッスンを再開する` }),
    ).toHaveAttribute('href', `/courses/${fixtureCourse.id}/lessons/${lesson.id}/resume`);
    expect(screen.queryByText('未着手')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'コース進捗' })).toHaveAttribute('value', '0');
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
    expect(screen.queryByText(/以前の達成記録は残っています/u)).not.toBeInTheDocument();
  });

  it('途中のLessonは先頭Slideではなく保存値を解決する再開Linkを表示する', async () => {
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: {
        ...completedProgress,
        lessons: {},
        currentComplete: false,
        currentLessonId: 'lesson-first-heading',
      },
      error: undefined,
      retry: vi.fn(),
    });
    renderCourseMap();

    expect(
      await screen.findByRole('link', { name: '見出しを置くレッスンを再開する' }),
    ).toHaveAttribute('href', '/courses/html-css/lessons/lesson-first-heading/resume');
  });

  it('以前に達成したLessonを再編集したときは記録の保持と再判定を案内する', async () => {
    useCourseProgress.mockReturnValue({
      status: 'ready',
      progress: {
        ...completedProgress,
        lessons: {
          'lesson-first-heading': {
            ...completedProgress.lessons['lesson-first-heading'],
            passedExerciseIds: [],
            currentComplete: false,
          },
        },
        currentComplete: false,
        currentLessonId: 'lesson-first-heading',
      },
      error: undefined,
      retry: vi.fn(),
    });
    renderCourseMap();

    expect(await screen.findByText('0 / 1')).toBeInTheDocument();
    expect(
      screen.getByText(
        '以前の達成記録は残っています。現在のコードを、もう一度「判定する」で確認してください。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('現在のピース')).toHaveAttribute('data-status', 'current');
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
