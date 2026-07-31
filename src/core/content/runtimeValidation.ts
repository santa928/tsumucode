/** Compiler検証済みArtifactをRuntimeで軽量再検証する純粋境界。 */
import { resolvePublicAsset } from '../../shared/lib/resolvePublicAsset';
import type {
  CourseCatalog,
  CourseCatalogEntry,
  CourseCatalogLessonStart,
  CourseManifest,
  LearningPathDefinition,
  LearningPathStep,
  LessonStartTarget,
} from './types';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CATALOG_KEYS = ['courses', 'learningPaths', 'schemaVersion'] as const;
const CATALOG_ENTRY_KEYS = [
  'audience',
  'description',
  'estimatedMinutes',
  'id',
  'lessonStarts',
  'manifestPath',
  'manifestSha256',
  'publicationStatus',
  'revision',
  'title',
] as const;
const CATALOG_LESSON_START_KEYS = ['lessonId', 'target'] as const;
const LESSON_START_TARGET_KEYS = ['kind', 'targetId'] as const;
const LEARNING_PATH_KEYS = ['description', 'id', 'publicationStatus', 'steps', 'title'] as const;
const LEARNING_PATH_STEP_KEYS = ['courseId', 'prerequisiteCourseIds', 'role'] as const;
const COURSE_KEYS = [
  'audience',
  'concepts',
  'description',
  'estimatedMinutes',
  'expectedTotals',
  'glossary',
  'id',
  'phases',
  'prerequisites',
  'progressMigrations',
  'provenanceManifestPath',
  'publicationStatus',
  'revision',
  'runnerId',
  'schemaVersion',
  'supportedDevices',
  'title',
  'validatorId',
] as const;

/** unknownを配列でないrecordへ限定する。 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recordのkey集合が期待値と完全一致するか判定する。 */
function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** 空白だけでない文字列か判定する。 */
function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Catalog内のLesson開始targetをexact-keyの識別Unionへ変換する。 */
function parseLessonStartTarget(value: unknown): LessonStartTarget {
  if (!isRecord(value) || !hasExactKeys(value, LESSON_START_TARGET_KEYS)) {
    throw new Error('Course Catalog Lesson start targetのfieldが一致しません。');
  }
  if (
    (value.kind !== 'slide' && value.kind !== 'exercise') ||
    !isNonEmptyText(value.targetId) ||
    !ID_PATTERN.test(value.targetId)
  ) {
    throw new Error('Course Catalog Lesson start targetの値が契約に一致しません。');
  }
  return value as unknown as LessonStartTarget;
}

/** Catalog内のLesson IDと開始targetを軽量契約へ変換する。 */
function parseCatalogLessonStart(value: unknown): CourseCatalogLessonStart {
  if (!isRecord(value) || !hasExactKeys(value, CATALOG_LESSON_START_KEYS)) {
    throw new Error('Course Catalog Lesson startのfieldが一致しません。');
  }
  if (!isNonEmptyText(value.lessonId) || !ID_PATTERN.test(value.lessonId)) {
    throw new Error('Course Catalog Lesson startの値が契約に一致しません。');
  }
  return {
    lessonId: value.lessonId,
    target: parseLessonStartTarget(value.target),
  };
}

/** Catalog entryを公開path・SHA・primitive型の厳密契約へ変換する。 */
function parseCatalogEntry(value: unknown): CourseCatalogEntry {
  if (!isRecord(value) || !hasExactKeys(value, CATALOG_ENTRY_KEYS)) {
    throw new Error('Course Catalog entryのfieldが一致しません。');
  }
  const publicationStatus = value.publicationStatus;
  if (
    !isNonEmptyText(value.id) ||
    !ID_PATTERN.test(value.id) ||
    !isNonEmptyText(value.title) ||
    !isNonEmptyText(value.description) ||
    !isNonEmptyText(value.audience) ||
    !Number.isInteger(value.estimatedMinutes) ||
    Number(value.estimatedMinutes) <= 0 ||
    !isNonEmptyText(value.revision) ||
    (publicationStatus !== 'draft' && publicationStatus !== 'published') ||
    !isNonEmptyText(value.manifestPath) ||
    !isNonEmptyText(value.manifestSha256) ||
    !SHA256_PATTERN.test(value.manifestSha256) ||
    !Array.isArray(value.lessonStarts) ||
    value.lessonStarts.length === 0
  ) {
    throw new Error('Course Catalog entryの値が契約に一致しません。');
  }
  resolvePublicAsset('/', value.manifestPath);
  return {
    ...(value as unknown as Omit<CourseCatalogEntry, 'lessonStarts'>),
    lessonStarts: value.lessonStarts.map(parseCatalogLessonStart),
  };
}

/** LearningPath Stepをroleとprerequisite配列のstrict契約へ変換する。 */
function parseLearningPathStep(value: unknown): LearningPathStep {
  if (!isRecord(value) || !hasExactKeys(value, LEARNING_PATH_STEP_KEYS)) {
    throw new Error('LearningPath Stepのfieldが一致しません。');
  }
  if (
    !isNonEmptyText(value.courseId) ||
    !ID_PATTERN.test(value.courseId) ||
    (value.role !== 'required' && value.role !== 'recommended') ||
    !Array.isArray(value.prerequisiteCourseIds) ||
    !value.prerequisiteCourseIds.every((item) => isNonEmptyText(item) && ID_PATTERN.test(item))
  ) {
    throw new Error('LearningPath Stepの値が契約に一致しません。');
  }
  return value as unknown as LearningPathStep;
}

/** 公開Catalog内のLearningPath定義を軽量契約へ変換する。 */
function parseLearningPath(value: unknown): LearningPathDefinition {
  if (!isRecord(value) || !hasExactKeys(value, LEARNING_PATH_KEYS)) {
    throw new Error('LearningPathのfieldが一致しません。');
  }
  if (
    !isNonEmptyText(value.id) ||
    !ID_PATTERN.test(value.id) ||
    !isNonEmptyText(value.title) ||
    !isNonEmptyText(value.description) ||
    (value.publicationStatus !== 'draft' && value.publicationStatus !== 'published') ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0
  ) {
    throw new Error('LearningPathの値が契約に一致しません。');
  }
  return {
    id: value.id,
    title: value.title,
    description: value.description,
    publicationStatus: value.publicationStatus,
    steps: value.steps.map(parseLearningPathStep),
  };
}

/** 公開Catalogを小さなRuntime契約で検証し、重複IDとpathも拒否する。 */
export function parseRuntimeCourseCatalog(value: unknown): CourseCatalog {
  if (!isRecord(value) || !hasExactKeys(value, CATALOG_KEYS)) {
    throw new Error('Course Catalog rootのfieldが一致しません。');
  }
  if (
    value.schemaVersion !== 2 ||
    !Array.isArray(value.courses) ||
    value.courses.length === 0 ||
    !Array.isArray(value.learningPaths)
  ) {
    throw new Error('Course Catalog rootの値が契約に一致しません。');
  }
  const courses = value.courses.map(parseCatalogEntry);
  const learningPaths = value.learningPaths.map(parseLearningPath);
  const ids = new Set<string>();
  const paths = new Set<string>();
  const publicationStatusById = new Map<string, 'draft' | 'published'>();
  for (const course of courses) {
    const canonicalPath = resolvePublicAsset('/', course.manifestPath);
    if (ids.has(course.id) || paths.has(canonicalPath)) {
      throw new Error('Course Catalogに重複IDまたはManifest pathがあります。');
    }
    ids.add(course.id);
    paths.add(canonicalPath);
    publicationStatusById.set(course.id, course.publicationStatus);
    const lessonIds = new Set<string>();
    for (const lessonStart of course.lessonStarts) {
      if (lessonIds.has(lessonStart.lessonId)) {
        throw new Error('Course Catalogに重複Lesson IDがあります。');
      }
      lessonIds.add(lessonStart.lessonId);
    }
  }

  const learningPathIds = new Set<string>();
  for (const learningPath of learningPaths) {
    if (learningPathIds.has(learningPath.id)) {
      throw new Error('Course Catalogに重複LearningPath IDがあります。');
    }
    learningPathIds.add(learningPath.id);
    const previousCourseIds = new Set<string>();
    for (const step of learningPath.steps) {
      if (previousCourseIds.has(step.courseId)) {
        throw new Error('LearningPathに重複Course Stepがあります。');
      }
      if (!ids.has(step.courseId)) {
        throw new Error('LearningPathに未知Course参照があります。');
      }
      if (
        learningPath.publicationStatus === 'published' &&
        publicationStatusById.get(step.courseId) === 'draft'
      ) {
        throw new Error('公開LearningPathにdraft Course参照があります。');
      }
      const prerequisiteIds = new Set<string>();
      for (const prerequisiteId of step.prerequisiteCourseIds) {
        if (prerequisiteIds.has(prerequisiteId) || !previousCourseIds.has(prerequisiteId)) {
          throw new Error('LearningPath prerequisiteが前方Stepを参照しています。');
        }
        prerequisiteIds.add(prerequisiteId);
      }
      previousCourseIds.add(step.courseId);
    }
  }

  return { schemaVersion: 2, courses, learningPaths };
}

/** SHA一致済みCourseのtop-level envelopeとCatalog上のID・revisionを再検証する。 */
export function parseIntegrityVerifiedCourseManifest(
  value: unknown,
  expected: CourseCatalogEntry,
): CourseManifest {
  if (!isRecord(value) || !hasExactKeys(value, COURSE_KEYS)) {
    throw new Error('Course Manifest rootのfieldが一致しません。');
  }
  if (
    value.schemaVersion !== 1 ||
    value.id !== expected.id ||
    value.revision !== expected.revision ||
    value.title !== expected.title ||
    value.description !== expected.description ||
    value.audience !== expected.audience ||
    value.estimatedMinutes !== expected.estimatedMinutes ||
    value.publicationStatus !== expected.publicationStatus ||
    !isNonEmptyText(value.runnerId) ||
    !isNonEmptyText(value.validatorId) ||
    !Array.isArray(value.glossary) ||
    !Array.isArray(value.concepts) ||
    !Array.isArray(value.prerequisites) ||
    !Array.isArray(value.progressMigrations) ||
    !Array.isArray(value.phases) ||
    value.phases.length === 0 ||
    !isRecord(value.supportedDevices) ||
    !isRecord(value.expectedTotals) ||
    !isNonEmptyText(value.provenanceManifestPath)
  ) {
    throw new Error('Course Manifest rootの値が契約に一致しません。');
  }
  return value as CourseManifest;
}
