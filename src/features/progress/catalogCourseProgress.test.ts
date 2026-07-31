/** Catalog metadataだけでCourse進捗と再開先を導出する契約を検証する。 */
import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '../../../tests/fixtures/course';
import type { CourseCatalogEntry } from '../../core/content/types';
import type { CourseProgress, LessonProgress } from '../../core/persistence/contracts';
import { summarizeCatalogCourseProgress } from './catalogCourseProgress';

const NOW = '2026-07-31T00:00:00.000Z';
const FIRST_LESSON_ID = 'lesson-first-heading';

/** Lesson単位の最小進捗を作る。 */
function lessonProgress(lessonId: string, currentComplete: boolean): LessonProgress {
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

/** Fixture Catalogと同じrevisionのCourse進捗を作る。 */
function courseProgress(overrides: Partial<CourseProgress> = {}): CourseProgress {
  const course = fixtureCatalog.courses[0]!;
  return {
    courseId: course.id,
    contentRevision: course.revision,
    lessons: {},
    currentComplete: false,
    updatedAt: NOW,
    ...overrides,
  };
}

/** 進捗順と未知Lesson fallbackを検証できる2 Lesson Catalog entryを作る。 */
function twoLessonCourse(): CourseCatalogEntry {
  const course = structuredClone(fixtureCatalog.courses[0]!);
  course.lessonStarts.push({
    lessonId: 'lesson-second',
    target: { kind: 'exercise', targetId: 'exercise-second' },
  });
  return course;
}

describe('summarizeCatalogCourseProgress', () => {
  it('未開始は先頭Lessonの開始先を返す', () => {
    expect(summarizeCatalogCourseProgress(fixtureCatalog.courses[0]!, undefined)).toEqual({
      status: 'not-started',
      completedLessons: 0,
      totalLessons: 1,
      actionPath: '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
      currentLessonId: FIRST_LESSON_ID,
    });
  });

  it('既知の保存中Lessonを優先し未知Lesson進捗は数えない', () => {
    const course = twoLessonCourse();
    const progress = courseProgress({
      lessons: {
        'lesson-removed': lessonProgress('lesson-removed', true),
      },
      currentLessonId: 'lesson-second',
    });

    expect(summarizeCatalogCourseProgress(course, progress)).toEqual({
      status: 'in-progress',
      completedLessons: 0,
      totalLessons: 2,
      actionPath: '/courses/html-css/lessons/lesson-second/exercises/exercise-second',
      currentLessonId: 'lesson-second',
    });
  });

  it('保存中Lessonが完了済みなら最初の未完了Lessonへfallbackする', () => {
    const course = twoLessonCourse();
    const progress = courseProgress({
      lessons: {
        [FIRST_LESSON_ID]: lessonProgress(FIRST_LESSON_ID, true),
      },
      currentLessonId: FIRST_LESSON_ID,
    });

    expect(summarizeCatalogCourseProgress(course, progress)).toMatchObject({
      status: 'in-progress',
      completedLessons: 1,
      totalLessons: 2,
      actionPath: '/courses/html-css/lessons/lesson-second/exercises/exercise-second',
      currentLessonId: 'lesson-second',
    });
  });

  it('全Lesson完了時はCourse Mapへ戻す', () => {
    const progress = courseProgress({
      lessons: {
        [FIRST_LESSON_ID]: lessonProgress(FIRST_LESSON_ID, true),
      },
      currentLessonId: FIRST_LESSON_ID,
      currentComplete: true,
      firstCompletedAt: NOW,
    });

    expect(summarizeCatalogCourseProgress(fixtureCatalog.courses[0]!, progress)).toEqual({
      status: 'complete',
      completedLessons: 1,
      totalLessons: 1,
      actionPath: '/courses/html-css',
    });
  });

  it('revision不一致をthrowせず未集計でCourse Mapへ送る', () => {
    const progress = courseProgress({ contentRevision: 'old-revision' });

    expect(summarizeCatalogCourseProgress(fixtureCatalog.courses[0]!, progress)).toEqual({
      status: 'revision-mismatch',
      completedLessons: 0,
      totalLessons: 1,
      actionPath: '/courses/html-css',
    });
  });

  it('Course ID不一致をprogramming errorとして拒否する', () => {
    const progress = courseProgress({ courseId: 'different-course' });

    expect(() => summarizeCatalogCourseProgress(fixtureCatalog.courses[0]!, progress)).toThrow(
      /Course ID/u,
    );
  });

  it('入力を変更せず新しいsummaryを返す', () => {
    const course = twoLessonCourse();
    const progress = courseProgress({ currentLessonId: 'lesson-second' });
    const courseBefore = structuredClone(course);
    const progressBefore = structuredClone(progress);

    const summary = summarizeCatalogCourseProgress(course, progress);

    expect(course).toEqual(courseBefore);
    expect(progress).toEqual(progressBefore);
    expect(summary).not.toBe(course);
    expect(summary).not.toBe(progress);
  });
});
