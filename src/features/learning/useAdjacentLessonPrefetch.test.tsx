import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCourseIndex } from '../../../tests/fixtures/course';
import type { CourseIndex, LessonOutline } from '../../core/content/types';
import { useAdjacentLessonPrefetch } from './useAdjacentLessonPrefetch';

const content = vi.hoisted(() => ({
  prefetchLesson: vi.fn<(baseUrl: string, course: CourseIndex, lessonId: string) => Promise<void>>(
    async () => undefined,
  ),
}));

vi.mock('../../core/content/CourseContentRepository', () => ({
  courseContentRepository: { prefetchLesson: content.prefetchLesson },
}));

/** 前後Lessonを持つHook用Course Indexを返す。 */
function threeLessonIndex(): CourseIndex {
  const index = structuredClone(fixtureCourseIndex);
  const base = index.phases[0]!.chapters[0]!.lessons[0]! as Extract<
    LessonOutline,
    { kind: 'standard' }
  >;
  const lesson = (id: string): Extract<LessonOutline, { kind: 'standard' }> => ({
    ...structuredClone(base),
    id,
    slides: base.slides.map((slide) => ({ ...slide, id: `${id}-slide` })),
    exercises: base.exercises.map((exercise) => ({ ...exercise, id: `${id}-exercise` })),
    completion: {
      kind: 'standard',
      finalSlideId: `${id}-slide`,
      requiredExerciseIds: [`${id}-exercise`],
    },
    manifestPath: `generated/content/courses/html-css/lessons/${id}.json`,
  });
  index.phases[0]!.chapters[0]!.lessons = [
    lesson('lesson-before'),
    lesson('lesson-middle'),
    lesson('lesson-after'),
  ];
  return index;
}

/** Hookだけをmountする。 */
function Harness({
  course,
  lessonId,
}: {
  readonly course: CourseIndex;
  readonly lessonId: string;
}) {
  useAdjacentLessonPrefetch(course, lessonId);
  return null;
}

let idleCallback: IdleRequestCallback | undefined;

beforeEach(() => {
  content.prefetchLesson.mockClear();
  idleCallback = undefined;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: { saveData: false },
  });
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((callback: IdleRequestCallback) => {
      idleCallback = callback;
      return 42;
    }),
  );
  vi.stubGlobal('cancelIdleCallback', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'connection');
});

describe('useAdjacentLessonPrefetch', () => {
  it('idle時に前後LessonだけをRepositoryの通常cache経路へ流す', async () => {
    const course = threeLessonIndex();
    render(<Harness course={course} lessonId="lesson-middle" />);

    expect(content.prefetchLesson).not.toHaveBeenCalled();
    await act(async () => {
      idleCallback?.({ didTimeout: false, timeRemaining: () => 10 });
      await Promise.resolve();
    });

    expect(content.prefetchLesson.mock.calls.map(([, , lessonId]) => lessonId)).toEqual([
      'lesson-before',
      'lesson-after',
    ]);
  });

  it('unmount時に未実行idle callbackをcancelする', () => {
    const view = render(<Harness course={threeLessonIndex()} lessonId="lesson-middle" />);

    view.unmount();

    expect(cancelIdleCallback).toHaveBeenCalledWith(42);
    expect(content.prefetchLesson).not.toHaveBeenCalled();
  });

  it.each([
    ['hidden', false],
    ['visible', true],
  ])('visibility=%s、saveData=%sではidle scheduleを作らない', (visibilityState, saveData) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: visibilityState,
    });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData },
    });

    render(<Harness course={threeLessonIndex()} lessonId="lesson-middle" />);

    expect(requestIdleCallback).not.toHaveBeenCalled();
    expect(content.prefetchLesson).not.toHaveBeenCalled();
  });
});
