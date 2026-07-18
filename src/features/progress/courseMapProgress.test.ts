/** Course Mapへ永続進捗を重ねる純粋変換の契約を検証する。 */
import { describe, expect, it } from 'vitest';
import { buildCourseMap, type CourseMap } from '../../core/content/courseMap';
import type { CourseProgress, LessonProgress } from '../../core/persistence/contracts';
import { fixtureCourse } from '../../../tests/fixtures/course';
import { applyCourseProgress } from './courseMapProgress';

const NOW = '2026-07-10T00:00:00.000Z';
const FIRST_LESSON_ID = 'lesson-first-heading';
const SECOND_LESSON_ID = 'lesson-second';

/** 進捗の並び替えとfallbackを検証できる2 Lesson構成を作る。 */
function makeTwoLessonMap(): CourseMap {
  const map = buildCourseMap(fixtureCourse);
  const phase = map.phases[0]!;
  const chapter = phase.chapters[0]!;
  const firstLesson = chapter.lessons[0]!;

  return {
    ...map,
    phases: [
      {
        ...phase,
        chapters: [
          {
            ...chapter,
            lessons: [
              firstLesson,
              {
                ...firstLesson,
                id: SECOND_LESSON_ID,
                title: '次のLesson',
                status: 'not-started',
                startPath: `/courses/${fixtureCourse.id}/lessons/${SECOND_LESSON_ID}/slides/slide-second`,
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Lesson単位の最小進捗を作る。 */
function makeLessonProgress(lessonId: string, currentComplete: boolean): LessonProgress {
  return {
    lessonId,
    viewedSlideIds: [],
    passedExerciseIds: [],
    passedChecklistItemIds: [],
    passedRuleIds: [],
    passedViewportIds: [],
    currentComplete,
    ...(currentComplete ? { firstCompletedAt: NOW } : {}),
  };
}

/** Course進捗を対象ケースに必要な差分だけで作る。 */
function makeProgress(overrides: Partial<CourseProgress> = {}): CourseProgress {
  return {
    courseId: fixtureCourse.id,
    contentRevision: fixtureCourse.revision,
    lessons: {},
    currentComplete: false,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('applyCourseProgress', () => {
  it('完了数を集計し、完了済み現在地から教材順の最初の未完了へfallbackする', () => {
    const result = applyCourseProgress(
      makeTwoLessonMap(),
      makeProgress({
        lessons: { [FIRST_LESSON_ID]: makeLessonProgress(FIRST_LESSON_ID, true) },
        currentLessonId: FIRST_LESSON_ID,
      }),
      fixtureCourse.revision,
    );

    expect(result.phases[0]!.chapters[0]!.lessons.map(({ status }) => status)).toEqual([
      'complete',
      'current',
    ]);
    expect(result.completedLessons).toBe(1);
    expect(result.totalLessons).toBe(2);
  });

  it('既知かつ未完了のcurrentLessonIdを現在地として維持する', () => {
    const result = applyCourseProgress(
      makeTwoLessonMap(),
      makeProgress({ currentLessonId: SECOND_LESSON_ID }),
      fixtureCourse.revision,
    );

    expect(result.phases[0]!.chapters[0]!.lessons.map(({ status }) => status)).toEqual([
      'not-started',
      'current',
    ]);
  });

  it('未知Lessonの進捗を集計せず、未知の現在地から最初の未完了へfallbackする', () => {
    const result = applyCourseProgress(
      makeTwoLessonMap(),
      makeProgress({
        lessons: { 'lesson-removed': makeLessonProgress('lesson-removed', true) },
        currentLessonId: 'lesson-removed',
      }),
      fixtureCourse.revision,
    );

    expect(result.completedLessons).toBe(0);
    expect(result.phases[0]!.chapters[0]!.lessons.map(({ status }) => status)).toEqual([
      'current',
      'not-started',
    ]);
  });

  it('全Lesson完了時はcurrentを作らない', () => {
    const result = applyCourseProgress(
      makeTwoLessonMap(),
      makeProgress({
        lessons: {
          [FIRST_LESSON_ID]: makeLessonProgress(FIRST_LESSON_ID, true),
          [SECOND_LESSON_ID]: makeLessonProgress(SECOND_LESSON_ID, true),
        },
        currentLessonId: SECOND_LESSON_ID,
        currentComplete: true,
        firstCompletedAt: NOW,
      }),
      fixtureCourse.revision,
    );

    const lessons = result.phases[0]!.chapters[0]!.lessons;
    expect(lessons.map(({ status }) => status)).toEqual(['complete', 'complete']);
    expect(lessons.some(({ status }) => status === 'current')).toBe(false);
    expect(result.completedLessons).toBe(2);
  });

  it('進捗が無い場合はFoundation既定の最初のcurrentを維持する', () => {
    const map = makeTwoLessonMap();
    const result = applyCourseProgress(map, undefined, fixtureCourse.revision);

    expect(result.phases).toEqual(map.phases);
    expect(result.completedLessons).toBe(0);
    expect(result.totalLessons).toBe(2);
  });

  it('Course ID不一致をfail closedで拒否する', () => {
    expect(() =>
      applyCourseProgress(
        makeTwoLessonMap(),
        makeProgress({ courseId: 'different-course' }),
        fixtureCourse.revision,
      ),
    ).toThrow(/Course ID/u);
  });

  it('教材revision不一致をfail closedで拒否する', () => {
    expect(() =>
      applyCourseProgress(
        makeTwoLessonMap(),
        makeProgress({ contentRevision: 'future-revision' }),
        fixtureCourse.revision,
      ),
    ).toThrow(/content revision/u);
  });

  it('入力mapとprogressを変更せず新しい表示Modelを返す', () => {
    const map = makeTwoLessonMap();
    const progress = makeProgress({ currentLessonId: SECOND_LESSON_ID });
    const mapBefore = structuredClone(map);
    const progressBefore = structuredClone(progress);

    const result = applyCourseProgress(map, progress, fixtureCourse.revision);

    expect(map).toEqual(mapBefore);
    expect(progress).toEqual(progressBefore);
    expect(result).not.toBe(map);
    expect(result.phases).not.toBe(map.phases);
  });

  it('空Course mapでは未知Lesson進捗を無視して0件を返す', () => {
    const emptyMap: CourseMap = { ...buildCourseMap(fixtureCourse), phases: [] };
    const result = applyCourseProgress(
      emptyMap,
      makeProgress({
        lessons: { 'lesson-removed': makeLessonProgress('lesson-removed', true) },
        currentLessonId: 'lesson-removed',
      }),
      fixtureCourse.revision,
    );

    expect(result.phases).toEqual([]);
    expect(result.completedLessons).toBe(0);
    expect(result.totalLessons).toBe(0);
  });
});
