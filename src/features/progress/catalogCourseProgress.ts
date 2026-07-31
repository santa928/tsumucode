/** Course Manifestを読まず、Catalog metadataと端末進捗だけでCourse表示状態を導出する。 */
import { lessonStartTargetPath } from '../../core/content/lessonStart';
import type { CourseCatalogEntry } from '../../core/content/types';
import type { CourseProgress } from '../../core/persistence/contracts';

export type CatalogCourseProgressStatus =
  'not-started' | 'in-progress' | 'complete' | 'revision-mismatch';

export interface CatalogCourseProgressSummary {
  readonly status: CatalogCourseProgressStatus;
  readonly completedLessons: number;
  readonly totalLessons: number;
  readonly actionPath: string;
  readonly currentLessonId?: string;
}

/** Catalog上のLesson開始定義を通常学習Routeへ変換する。 */
function lessonActionPath(course: CourseCatalogEntry, lessonId: string): string | undefined {
  const lesson = course.lessonStarts.find((candidate) => candidate.lessonId === lessonId);
  return lesson === undefined
    ? undefined
    : lessonStartTargetPath(course.id, lesson.lessonId, lesson.target);
}

/**
 * Catalogに存在するLessonだけを集計し、HomeとLearningPathが共有できる再開先を返す。
 * revision不一致は古い保存値を表示へ混ぜず、Course Map上のmigration確認へ送る。
 */
export function summarizeCatalogCourseProgress(
  course: CourseCatalogEntry,
  progress: CourseProgress | undefined,
): CatalogCourseProgressSummary {
  const coursePath = `/courses/${course.id}`;
  const totalLessons = course.lessonStarts.length;

  if (progress !== undefined && progress.courseId !== course.id) {
    throw new Error('Catalog CourseとCourseProgressのCourse IDが一致しません');
  }
  if (progress !== undefined && progress.contentRevision !== course.revision) {
    return {
      status: 'revision-mismatch',
      completedLessons: 0,
      totalLessons,
      actionPath: coursePath,
    };
  }

  const completedLessonIds = new Set(
    course.lessonStarts
      .filter(({ lessonId }) => progress?.lessons[lessonId]?.currentComplete === true)
      .map(({ lessonId }) => lessonId),
  );
  if (totalLessons > 0 && completedLessonIds.size === totalLessons) {
    return {
      status: 'complete',
      completedLessons: completedLessonIds.size,
      totalLessons,
      actionPath: coursePath,
    };
  }

  const requestedLessonId = progress?.currentLessonId;
  const currentLessonId =
    requestedLessonId !== undefined &&
    lessonActionPath(course, requestedLessonId) !== undefined &&
    !completedLessonIds.has(requestedLessonId)
      ? requestedLessonId
      : course.lessonStarts.find(({ lessonId }) => !completedLessonIds.has(lessonId))?.lessonId;

  return {
    status: progress === undefined ? 'not-started' : 'in-progress',
    completedLessons: completedLessonIds.size,
    totalLessons,
    actionPath:
      currentLessonId === undefined
        ? coursePath
        : (lessonActionPath(course, currentLessonId) ?? coursePath),
    ...(currentLessonId === undefined ? {} : { currentLessonId }),
  };
}
