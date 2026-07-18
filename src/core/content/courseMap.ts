/** 教材Manifestを、学習順と開始先を持つコースマップ表示Modelへ変換する。 */
import type { CourseManifest, Lesson } from './types';

export type CourseMapStatus = 'complete' | 'current' | 'not-started';

export interface CourseMapLesson {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly estimatedMinutes: number;
  readonly kind: Lesson['kind'];
  readonly status: CourseMapStatus;
  readonly startPath: string;
}

export interface CourseMapChapter {
  readonly id: string;
  readonly sequence: number;
  readonly title: string;
  readonly goal: string;
  readonly estimatedMinutes: number;
  readonly kind: 'standard' | 'guided-project' | 'capstone';
  readonly lessons: readonly CourseMapLesson[];
}

export interface CourseMapPhase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly chapters: readonly CourseMapChapter[];
}

export interface CourseMap {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly phases: readonly CourseMapPhase[];
}

/** 基礎Lessonは先頭Slide、制作LessonはGuideを飛ばして先頭ExerciseへのRouteを返す。 */
export function lessonStartPath(courseId: string, lesson: Lesson): string {
  const firstExercise = lesson.exercises[0];
  if (lesson.kind !== 'standard' && firstExercise !== undefined) {
    return `/courses/${courseId}/lessons/${lesson.id}/exercises/${firstExercise.id}`;
  }

  const firstSlide = lesson.slides[0];
  if (firstSlide !== undefined) {
    return `/courses/${courseId}/lessons/${lesson.id}/slides/${firstSlide.id}`;
  }

  if (firstExercise !== undefined) {
    return `/courses/${courseId}/lessons/${lesson.id}/exercises/${firstExercise.id}`;
  }

  throw new Error(`Lessonに開始できる教材がありません: ${lesson.id}`);
}

/** Phase／Lessonの著者順を保ち、Chapterをsequence順へ整列した表示Modelを作る。 */
export function buildCourseMap(course: CourseManifest): CourseMap {
  let isFirstLesson = true;

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    estimatedMinutes: course.estimatedMinutes,
    phases: course.phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      description: phase.description,
      chapters: [...phase.chapters]
        .sort((left, right) => left.sequence - right.sequence)
        .map((chapter) => ({
          id: chapter.id,
          sequence: chapter.sequence,
          title: chapter.title,
          goal: chapter.goal,
          estimatedMinutes: chapter.estimatedMinutes,
          kind: chapter.kind,
          lessons: chapter.lessons.map((lesson) => {
            const status: CourseMapStatus = isFirstLesson ? 'current' : 'not-started';
            isFirstLesson = false;

            return {
              id: lesson.id,
              title: lesson.title,
              goal: lesson.goal,
              estimatedMinutes: lesson.estimatedMinutes,
              kind: lesson.kind,
              status,
              startPath: lessonStartPath(course.id, lesson),
            };
          }),
        })),
    })),
  };
}
