/** 永続IDからCourse階層の教材entityを取得する純粋selector群。 */
import type { CourseIndex, CourseManifest, Exercise, Lesson, LessonOutline, Slide } from './types';

type SlideOutline = LessonOutline['slides'][number];
type ExerciseOutline = LessonOutline['exercises'][number];

export interface WorkspaceExerciseLocation {
  readonly lessonId: string;
  readonly exerciseId: string;
}

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

/** Course IndexのLesson outlineを著者順に連結する。 */
export function courseLessonOutlines(course: CourseIndex): readonly LessonOutline[] {
  return course.phases.flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons));
}

/** Course IndexからLesson outlineを永続IDで検索する。 */
export function findLessonOutline(course: CourseIndex, lessonId: string): LessonOutline {
  const lesson = courseLessonOutlines(course).find(({ id }) => id === lessonId);
  if (lesson !== undefined) return lesson;
  throw new Error(`Lessonが見つかりません: ${lessonId}`);
}

/** Course IndexからSlide outlineと所有Lessonを検索する。 */
export function findSlideOwner(
  course: CourseIndex,
  slideId: string,
): { readonly lesson: LessonOutline; readonly slide: SlideOutline } {
  for (const lesson of courseLessonOutlines(course)) {
    const slide = lesson.slides.find(({ id }) => id === slideId);
    if (slide !== undefined) return { lesson, slide };
  }
  throw new Error(`Slideが見つかりません: ${slideId}`);
}

/** Course IndexからExercise outlineと所有Lessonを検索する。 */
export function findExerciseOwner(
  course: CourseIndex,
  exerciseId: string,
): { readonly lesson: LessonOutline; readonly exercise: ExerciseOutline } {
  for (const lesson of courseLessonOutlines(course)) {
    const exercise = lesson.exercises.find(({ id }) => id === exerciseId);
    if (exercise !== undefined) return { lesson, exercise };
  }
  throw new Error(`Exerciseが見つかりません: ${exerciseId}`);
}

/** 現在Exerciseまでに現れた同一workspaceのExercise位置を教材順で返す。 */
export function resolveWorkspaceExerciseLocations(
  course: CourseIndex,
  currentExerciseId: string,
): readonly WorkspaceExerciseLocation[] {
  const exercises = courseLessonOutlines(course).flatMap((lesson) =>
    lesson.exercises.map((exercise) => ({
      lessonId: lesson.id,
      exerciseId: exercise.id,
      workspaceId: exercise.workspaceId,
    })),
  );
  const currentIndex = exercises.findIndex(({ exerciseId }) => exerciseId === currentExerciseId);
  if (currentIndex < 0) {
    throw new Error(`ExerciseがCourseにありません: ${currentExerciseId}`);
  }
  const workspaceId = exercises[currentIndex]!.workspaceId;
  return exercises
    .slice(0, currentIndex + 1)
    .filter((exercise) => exercise.workspaceId === workspaceId)
    .map(({ lessonId, exerciseId }) => ({ lessonId, exerciseId }));
}

/** 現在Exerciseまでの同一workspaceを所有するLesson IDを重複なく返す。 */
export function resolveWorkspaceLessonIds(
  course: CourseIndex,
  currentExerciseId: string,
): readonly string[] {
  return [
    ...new Set(
      resolveWorkspaceExerciseLocations(course, currentExerciseId).map(({ lessonId }) => lessonId),
    ),
  ];
}
