/** 教材Manifestを、学習順と開始先を持つコースマップ表示Modelへ変換する。 */
import type { LessonOutline } from './types';
import { lessonStartTarget, lessonStartTargetPath, type LessonStartSource } from './lessonStart';

export type CourseMapStatus = 'complete' | 'current' | 'not-started';

export interface CourseMapLesson {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly estimatedMinutes: number;
  readonly kind: LessonOutline['kind'];
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

type CourseMapLessonSource = LessonStartSource &
  Pick<LessonOutline, 'title' | 'goal' | 'estimatedMinutes'>;

interface CourseMapChapterSource {
  readonly id: string;
  readonly sequence: number;
  readonly title: string;
  readonly goal: string;
  readonly estimatedMinutes: number;
  readonly kind: CourseMapChapter['kind'];
  readonly lessons: readonly CourseMapLessonSource[];
}

interface CourseMapPhaseSource {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly chapters: readonly CourseMapChapterSource[];
}

/** Course map表示に必要なmetadataだけを要求する構造型。 */
export interface CourseMapSource {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly phases: readonly CourseMapPhaseSource[];
}

/** 基礎Lessonは先頭Slide、制作LessonはGuideを飛ばして先頭ExerciseへのRouteを返す。 */
export function lessonStartPath(courseId: string, lesson: CourseMapLessonSource): string {
  return lessonStartTargetPath(courseId, lesson.id, lessonStartTarget(lesson));
}

/** Phase／Lessonの著者順を保ち、Chapterをsequence順へ整列した表示Modelを作る。 */
export function buildCourseMap(course: CourseMapSource): CourseMap {
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
