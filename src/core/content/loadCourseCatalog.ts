/** 分割教材Repositoryを画面・サービスから利用するための薄い公開Facade。 */
import { courseContentRepository } from './CourseContentRepository';
import type { CourseCatalog, CourseCatalogEntry, CourseIndex, LessonManifest } from './types';

export { ContentLoadError, type ContentLoadErrorKind } from './CourseContentRepository';

/** Catalog v3をRepositoryのsingle-flight経路から取得する。 */
export const loadCourseCatalog = (baseUrl: string): Promise<CourseCatalog> =>
  courseContentRepository.loadCatalog(baseUrl);

/** Catalog entryのCourse IndexをRepositoryから取得する。 */
export const loadCourseIndex = (baseUrl: string, entry: CourseCatalogEntry): Promise<CourseIndex> =>
  courseContentRepository.loadCourseIndex(baseUrl, entry);

/** Course Index内のLesson ManifestをRepositoryから取得する。 */
export const loadLessonManifest = (
  baseUrl: string,
  index: CourseIndex,
  lessonId: string,
): Promise<LessonManifest> => courseContentRepository.loadLesson(baseUrl, index, lessonId);

/** 移行中の明示名もCatalog v3の同じ取得境界へ集約する。 */
export const loadCourseCatalogV3 = loadCourseCatalog;
