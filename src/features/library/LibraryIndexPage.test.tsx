import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { fixtureCourse } from '../../../tests/fixtures/course';
import type { CourseManifest, Exercise, Lesson, Slide } from '../../core/content/types';
import { LibraryIndexPage } from './LibraryIndexPage';

/** Slideを目次Test用の永続IDと題名へ複製する。 */
function createSlide(source: Slide, id: string, title: string): Slide {
  return { ...structuredClone(source), id, title };
}

/** standard Lessonを任意のSlide列で複製する。 */
function createStandardLesson(
  source: Lesson,
  id: string,
  title: string,
  slideIds: readonly string[],
): Lesson {
  if (source.kind !== 'standard') throw new Error('Fixture Lessonがstandardではありません');
  const slides = slideIds.map((slideId) => createSlide(source.slides[0]!, slideId, slideId));
  return {
    ...structuredClone(source),
    id,
    title,
    slides,
    completion: { ...source.completion, finalSlideId: slides.at(-1)!.id },
  };
}

/** standard Lessonを同じ教材本文を持つ制作Lessonへ変換する。 */
function createProjectLesson(source: Lesson, kind: 'guided-project' | 'capstone'): Lesson {
  if (source.kind !== 'standard') throw new Error('変換元Lessonがstandardではありません');
  const projectId = `project-${kind}`;
  const sourceExercise = source.exercises[0]!;
  const exercise: Exercise = {
    ...structuredClone(sourceExercise),
    id: `exercise-${kind}`,
    kind,
    projectId,
    countsTowardStandardExerciseTotal: false,
  };
  const requirementId = exercise.validationRules[0]!.id;
  const project = {
    id: projectId,
    brief: source.slides[0]!.blocks,
    guide: [],
    checklist: [
      {
        id: `checklist-${kind}`,
        label: `${kind}の確認`,
        required: true,
        ruleIds: [requirementId],
      },
    ],
  };

  if (kind === 'guided-project') {
    return {
      ...structuredClone(source),
      kind,
      exercises: [exercise],
      project,
      completion: {
        kind,
        requiredChecklistItemIds: [`checklist-${kind}`],
        requiredExerciseIds: [exercise.id],
      },
    };
  }
  return {
    ...structuredClone(source),
    kind,
    exercises: [exercise],
    project,
    completion: {
      kind,
      requiredRuleIds: [requirementId],
      requiredViewportIds: [exercise.previewViewports[0]!.id],
    },
  };
}

/** 3種類のChapterと全Slideを持つ目次Test用Courseを作る。 */
function createLibraryCourse(): CourseManifest {
  const course = structuredClone(fixtureCourse);
  course.title = 'HTML & CSS';
  const phase = course.phases[0]!;
  phase.title = 'Webページの土台';
  const chapter = phase.chapters[0]!;
  const sourceLesson = chapter.lessons[0]!;
  const standard = createStandardLesson(sourceLesson, 'lesson-a', 'Lesson A', [
    'slide-a-1',
    'slide-a-2',
  ]);
  const guided = createProjectLesson(
    createStandardLesson(sourceLesson, 'lesson-b', 'Lesson B', ['slide-b-1']),
    'guided-project',
  );
  const capstone = createProjectLesson(
    createStandardLesson(sourceLesson, 'lesson-c', 'Lesson C', ['slide-c-1']),
    'capstone',
  );
  phase.chapters = [
    { ...structuredClone(chapter), id: 'chapter-standard', kind: 'standard', lessons: [standard] },
    {
      ...structuredClone(chapter),
      id: 'chapter-guided',
      title: '一緒に作る',
      kind: 'guided-project',
      lessons: [guided],
    },
    {
      ...structuredClone(chapter),
      id: 'chapter-capstone',
      title: '自分で仕上げる',
      kind: 'capstone',
      lessons: [capstone],
    },
  ];
  return course;
}

/** Loader Dataを伴う実Route相当でスライド目次を表示する。 */
function renderLibraryIndex(course: CourseManifest): void {
  const router = createMemoryRouter(
    [
      {
        path: '/library/:courseId',
        loader: () => course,
        HydrateFallback: () => <p>目次を準備中</p>,
        element: <LibraryIndexPage />,
      },
    ],
    { initialEntries: [`/library/${course.id}`] },
  );
  render(<RouterProvider router={router} />);
}

describe('LibraryIndexPage', () => {
  it('全Phase・Chapter種別・Lessonを進捗表現なしで著者順に並べる', async () => {
    renderLibraryIndex(createLibraryCourse());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'HTML & CSS スライド目次' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('進捗を変えずに、すべてのスライドを自由に読めます'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Webページの土台' })).toBeInTheDocument();
    expect(screen.getByText('基礎レッスン')).toBeInTheDocument();
    expect(screen.getByText('ガイド制作')).toBeInTheDocument();
    expect(screen.getByText('仕上げ制作')).toBeInTheDocument();

    const lessonA = screen.getByRole('article', { name: 'Lesson A' });
    expect(within(lessonA).getByText('2枚')).toBeInTheDocument();
    expect(within(lessonA).getByRole('link', { name: 'Lesson Aを先頭から見る' })).toHaveAttribute(
      'href',
      '/library/html-css/lessons/lesson-a/slides/slide-a-1',
    );
    expect(screen.getByRole('link', { name: '通常学習へ戻る' })).toHaveAttribute(
      'href',
      '/courses/html-css',
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/完了|ロック|未到達/u)).not.toBeInTheDocument();
  });
});
