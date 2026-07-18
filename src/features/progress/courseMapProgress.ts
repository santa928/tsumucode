/** FoundationのCourse Map階層へ、検証済みの端末進捗を不変変換で重ねる。 */
import type { CourseMap, CourseMapStatus } from '../../core/content/courseMap';
import type { CourseProgress } from '../../core/persistence/contracts';

export interface CourseMapWithProgress extends CourseMap {
  readonly completedLessons: number;
  readonly totalLessons: number;
}

/**
 * Foundationの階層を維持し、同じCourse・教材revisionの進捗からstatusと集計を再計算する。
 * 未知Lessonの進捗は無視し、Courseまたはrevisionの不一致は古い進捗を表示しないよう拒否する。
 */
export function applyCourseProgress(
  map: CourseMap,
  progress: CourseProgress | undefined,
  expectedRevision: string,
): CourseMapWithProgress {
  const allLessons = map.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons),
  );

  if (progress !== undefined) {
    if (progress.courseId !== map.id) {
      throw new Error('Course MapとCourseProgressのCourse IDが一致しません');
    }
    if (progress.contentRevision !== expectedRevision) {
      throw new Error('CourseProgressのcontent revisionが現在の教材と一致しません');
    }
  }

  const completedLessonIds = new Set(
    allLessons
      .filter(({ id }) => progress?.lessons[id]?.currentComplete === true)
      .map(({ id }) => id),
  );
  const knownLessonIds = new Set(allLessons.map(({ id }) => id));
  const requestedCurrentId = progress?.currentLessonId;
  const currentLessonId =
    progress === undefined
      ? undefined
      : requestedCurrentId !== undefined &&
          knownLessonIds.has(requestedCurrentId) &&
          !completedLessonIds.has(requestedCurrentId)
        ? requestedCurrentId
        : allLessons.find(({ id }) => !completedLessonIds.has(id))?.id;

  return {
    ...map,
    phases: map.phases.map((phase) => ({
      ...phase,
      chapters: phase.chapters.map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.map((lesson) => {
          const status: CourseMapStatus =
            progress === undefined
              ? lesson.status
              : completedLessonIds.has(lesson.id)
                ? 'complete'
                : lesson.id === currentLessonId
                  ? 'current'
                  : 'not-started';

          return { ...lesson, status };
        }),
      })),
    })),
    completedLessons: completedLessonIds.size,
    totalLessons: allLessons.length,
  };
}
