/** Compiler検証済みArtifactをRuntimeで軽量再検証する純粋境界。 */
import { resolvePublicAsset } from '../../shared/lib/resolvePublicAsset';
import type { CourseCatalog, CourseCatalogEntry, CourseManifest } from './types';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CATALOG_KEYS = ['courses', 'schemaVersion'] as const;
const CATALOG_ENTRY_KEYS = [
  'audience',
  'description',
  'estimatedMinutes',
  'id',
  'manifestPath',
  'manifestSha256',
  'publicationStatus',
  'revision',
  'title',
] as const;
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
    !SHA256_PATTERN.test(value.manifestSha256)
  ) {
    throw new Error('Course Catalog entryの値が契約に一致しません。');
  }
  resolvePublicAsset('/', value.manifestPath);
  return value as CourseCatalogEntry;
}

/** 公開Catalogを小さなRuntime契約で検証し、重複IDとpathも拒否する。 */
export function parseRuntimeCourseCatalog(value: unknown): CourseCatalog {
  if (!isRecord(value) || !hasExactKeys(value, CATALOG_KEYS)) {
    throw new Error('Course Catalog rootのfieldが一致しません。');
  }
  if (value.schemaVersion !== 1 || !Array.isArray(value.courses) || value.courses.length === 0) {
    throw new Error('Course Catalog rootの値が契約に一致しません。');
  }
  const courses = value.courses.map(parseCatalogEntry);
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const course of courses) {
    const canonicalPath = resolvePublicAsset('/', course.manifestPath);
    if (ids.has(course.id) || paths.has(canonicalPath)) {
      throw new Error('Course Catalogに重複IDまたはManifest pathがあります。');
    }
    ids.add(course.id);
    paths.add(canonicalPath);
  }
  return { schemaVersion: 1, courses };
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
