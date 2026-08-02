/** 分割配信ArtifactをRuntimeでstrict検証し、親Artifactとの対応も照合する。 */
import { CourseCatalogV3Schema, CourseIndexSchema, LessonManifestSchema } from './deliverySchema';
import type { CourseCatalog, CourseCatalogEntry, CourseIndex, LessonManifest } from './types';

/** Catalog v3をstrict公開契約で検証する。 */
export function parseRuntimeCourseCatalogV3(value: unknown): CourseCatalog {
  return CourseCatalogV3Schema.parse(value);
}

/** SHA一致済みCourse IndexをCatalog metadataと照合する。 */
export function parseIntegrityVerifiedCourseIndex(
  value: unknown,
  expected: CourseCatalogEntry,
): CourseIndex {
  const index = CourseIndexSchema.parse(value);
  if (
    index.id !== expected.id ||
    index.revision !== expected.revision ||
    index.title !== expected.title ||
    index.description !== expected.description ||
    index.audience !== expected.audience ||
    index.estimatedMinutes !== expected.estimatedMinutes ||
    index.publicationStatus !== expected.publicationStatus
  ) {
    throw new Error('Course Index metadataがCatalog entryと一致しません。');
  }
  return index;
}

/** SHA一致済みLesson ManifestをCourse Indexと要求Lesson IDへ対応付ける。 */
export function parseIntegrityVerifiedLessonManifest(
  value: unknown,
  index: CourseIndex,
  lessonId: string,
): LessonManifest {
  const manifest = LessonManifestSchema.parse(value);
  const exists = index.phases.some(({ chapters }) =>
    chapters.some(({ lessons }) => lessons.some(({ id }) => id === lessonId)),
  );
  if (
    !exists ||
    manifest.courseId !== index.id ||
    manifest.courseRevision !== index.revision ||
    manifest.lessonId !== lessonId
  ) {
    throw new Error('Lesson ManifestがCourse Indexまたは要求Lessonと一致しません。');
  }
  return manifest;
}
