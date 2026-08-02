/** Catalog revisionと端末進捗を比較し、必要なCourseだけ既存migrationへ接続する。 */
import { loadCourseIndex, loadCourseManifest } from '../core/content/loadCourseCatalog';
import type {
  CourseCatalogEntry,
  CourseCatalogEntryV3,
  CourseIndex,
  CourseManifest,
} from '../core/content/types';
import type { ProgressRepository } from '../core/persistence/contracts';
import type { ContentMigrationNotice } from '../core/persistence/contentProgressMigration';
import {
  learningRuntimeServices,
  type LearningRuntimeServices,
} from '../features/learning/runtimeServices';

export interface CatalogProgressMigrationPort {
  readonly ready: Promise<void>;
  readonly repository: Pick<ProgressRepository, 'getCourse'>;
  loadManifest(entry: CourseCatalogEntry): Promise<CourseManifest>;
  ensureCourse(course: CourseManifest): Promise<void>;
}

export interface CatalogProgressIndexMigrationPort {
  readonly ready: Promise<void>;
  readonly repository: Pick<ProgressRepository, 'getCourse'>;
  loadIndex(entry: CourseCatalogEntryV3): Promise<CourseIndex>;
  ensureCourseIndex(index: CourseIndex): Promise<readonly ContentMigrationNotice[]>;
}

/**
 * 保存済みrevisionがCatalogと異なるCourseだけManifestを取得し、既存migrationへ渡す。
 * 未開始・同revision・Course ID不一致の保存recordはManifestを取得しない。
 */
export async function ensureCatalogCourseRevisions(
  entries: readonly CourseCatalogEntry[],
  port: CatalogProgressMigrationPort,
): Promise<void> {
  await port.ready;
  const uniqueEntries = new Map<string, CourseCatalogEntry>();
  for (const entry of entries) {
    if (!uniqueEntries.has(entry.id)) uniqueEntries.set(entry.id, entry);
  }

  await Promise.all(
    [...uniqueEntries.values()].map(async (entry) => {
      const progress = await port.repository.getCourse(entry.id);
      if (
        progress === undefined ||
        progress.courseId !== entry.id ||
        progress.contentRevision === entry.revision
      ) {
        return;
      }
      const course = await port.loadManifest(entry);
      await port.ensureCourse(course);
    }),
  );
}

/** 保存済みrevisionがCatalog v3と異なるCourseだけIndexを取得して移行する。 */
export async function ensureCatalogCourseIndexRevisions(
  entries: readonly CourseCatalogEntryV3[],
  port: CatalogProgressIndexMigrationPort,
): Promise<void> {
  await port.ready;
  const uniqueEntries = new Map<string, CourseCatalogEntryV3>();
  for (const entry of entries) {
    if (!uniqueEntries.has(entry.id)) uniqueEntries.set(entry.id, entry);
  }

  await Promise.all(
    [...uniqueEntries.values()].map(async (entry) => {
      const progress = await port.repository.getCourse(entry.id);
      if (
        progress === undefined ||
        progress.courseId !== entry.id ||
        progress.contentRevision === entry.revision
      ) {
        return;
      }
      const index = await port.loadIndex(entry);
      await port.ensureCourseIndex(index);
    }),
  );
}

/**
 * GitHub PagesのBase URLと既存Runtime serviceから選択migration portを構築する。
 * services注入はLoader testでIndexedDBを開かず同じ境界を検証するために使う。
 */
export function createCatalogProgressMigrationPort(
  baseUrl: string,
  services: Pick<
    LearningRuntimeServices,
    'ready' | 'repository' | 'ensureCourse'
  > = learningRuntimeServices,
): CatalogProgressMigrationPort {
  return {
    ready: services.ready,
    repository: services.repository,
    loadManifest: (entry) => loadCourseManifest(baseUrl, entry),
    ensureCourse: (course) => services.ensureCourse(course),
  };
}

/** Catalog v3用の選択migration portをIndex RepositoryとRuntimeから構築する。 */
export function createCatalogProgressIndexMigrationPort(
  baseUrl: string,
  services: Pick<
    LearningRuntimeServices,
    'ready' | 'repository' | 'ensureCourseIndex'
  > = learningRuntimeServices,
): CatalogProgressIndexMigrationPort {
  return {
    ready: services.ready,
    repository: services.repository,
    loadIndex: (entry) => loadCourseIndex(baseUrl, entry),
    ensureCourseIndex: (index) => services.ensureCourseIndex(index),
  };
}
