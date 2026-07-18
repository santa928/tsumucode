/** 永続IDからCourse階層の教材entityを取得する純粋selector群。 */
import type { CourseManifest, Exercise, Lesson, Slide } from './types';

/** Course階層からLessonを永続IDで検索し、未検出時は明示的に失敗する。 */
export function findLesson(course: CourseManifest, lessonId: string): Lesson {
  for (const phase of course.phases) {
    for (const chapter of phase.chapters) {
      const lesson = chapter.lessons.find(({ id }) => id === lessonId);
      if (lesson !== undefined) return lesson;
    }
  }
  throw new Error(`Lessonが見つかりません: ${lessonId}`);
}

/** Lesson内からSlideを永続IDで検索し、未検出時は明示的に失敗する。 */
export function findSlide(lesson: Lesson, slideId: string): Slide {
  const slide = lesson.slides.find(({ id }) => id === slideId);
  if (slide !== undefined) return slide;
  throw new Error(`Slideが見つかりません: ${slideId}`);
}

/** Course全体からSlideと所有Lessonを永続IDで検索する。 */
export function findSlideInCourse(
  course: CourseManifest,
  slideId: string,
): { readonly lesson: Lesson; readonly slide: Slide } {
  for (const phase of course.phases) {
    for (const chapter of phase.chapters) {
      for (const lesson of chapter.lessons) {
        const slide = lesson.slides.find(({ id }) => id === slideId);
        if (slide !== undefined) return { lesson, slide };
      }
    }
  }
  throw new Error(`Slideが見つかりません: ${slideId}`);
}

/** Lesson内からExerciseを永続IDで検索し、未検出時は明示的に失敗する。 */
export function findExercise(lesson: Lesson, exerciseId: string): Exercise {
  const exercise = lesson.exercises.find(({ id }) => id === exerciseId);
  if (exercise !== undefined) return exercise;
  throw new Error(`Exerciseが見つかりません: ${exerciseId}`);
}
