import { describe, expect, it, vi } from 'vitest';
import { fixtureCourseIndex } from '../../../tests/fixtures/course';
import type { CourseIndex, LessonOutline } from './types';
import { adjacentLessonIds, scheduleAdjacentLessonPrefetch } from './lessonPrefetch';

/** 3 Lessonを持つ最小Indexを作る。 */
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

describe('adjacentLessonIds', () => {
  it('教材順で現在Lessonの直前・直後だけを返す', () => {
    expect(adjacentLessonIds(threeLessonIndex(), 'lesson-middle')).toEqual([
      'lesson-before',
      'lesson-after',
    ]);
  });

  it('端では存在する隣接Lessonだけ、不明IDでは0件を返す', () => {
    const course = threeLessonIndex();
    expect(adjacentLessonIds(course, 'lesson-before')).toEqual(['lesson-middle']);
    expect(adjacentLessonIds(course, 'lesson-missing')).toEqual([]);
  });
});

describe('scheduleAdjacentLessonPrefetch', () => {
  it('visibleな画面だけ前後1 Lessonを最大2件prefetchする', async () => {
    const prefetch = vi.fn<(lessonId: string) => Promise<void>>(async () => undefined);
    const schedule = vi.fn(async (task: () => Promise<void>) => task());

    await scheduleAdjacentLessonPrefetch({
      course: threeLessonIndex(),
      lessonId: 'lesson-middle',
      visibilityState: 'visible',
      saveData: false,
      schedule,
      prefetch,
    });

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(prefetch.mock.calls.map(([lessonId]) => lessonId)).toEqual([
      'lesson-before',
      'lesson-after',
    ]);
  });

  it.each([
    ['hidden' as const, false],
    ['visible' as const, true],
  ])('visibility=%s、saveData=%sでは任意取得しない', async (visibilityState, saveData) => {
    const prefetch = vi.fn(async () => undefined);
    const schedule = vi.fn(async (task: () => Promise<void>) => task());

    await scheduleAdjacentLessonPrefetch({
      course: threeLessonIndex(),
      lessonId: 'lesson-middle',
      visibilityState,
      saveData,
      schedule,
      prefetch,
    });

    expect(schedule).not.toHaveBeenCalled();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('任意prefetch失敗を呼出元へ伝播せず、ほかの隣接取得も継続する', async () => {
    const prefetch = vi
      .fn<(lessonId: string) => Promise<void>>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(undefined);

    await expect(
      scheduleAdjacentLessonPrefetch({
        course: threeLessonIndex(),
        lessonId: 'lesson-middle',
        visibilityState: 'visible',
        saveData: false,
        schedule: async (task) => task(),
        prefetch,
      }),
    ).resolves.toBeUndefined();
    expect(prefetch).toHaveBeenCalledTimes(2);
  });
});
