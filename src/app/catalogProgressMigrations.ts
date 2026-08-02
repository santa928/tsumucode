/** Catalog revisionと端末進捗を比較し、必要なCourse Indexだけmigrationへ接続する。 */
import { loadCourseIndex } from '../core/content/loadCourseCatalog';
import type { CourseCatalogEntry, CourseIndex } from '../core/content/types';
import type { ProgressRepository } from '../core/persistence/contracts';
import type { ContentMigrationNotice } from '../core/persistence/contentProgressMigration';
import {
  learningRuntimeServices,
  type LearningRuntimeServices,
} from '../features/learning/runtimeServices';

export interface CatalogProgressMigrationPort {
  readonly ready: Promise<void>;
  readonly repository: Pick<ProgressRepository, 'getCourse'>;
  loadIndex(entry: CourseCatalogEntry): Promise<CourseIndex>;
  ensureCourseIndex(index: CourseIndex): Promise<readonly ContentMigrationNotice[]>;
}

/** 保存済みrevisionがCatalogと異なるCourseだけIndexを取得して移行する。 */
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
      const index = await port.loadIndex(entry);
      await port.ensureCourseIndex(index);
    }),
  );
}

/** GitHub PagesのBase URLとRuntime serviceから選択migration portを構築する。 */
export function createCatalogProgressMigrationPort(
  baseUrl: string,
  services: Pick<
    LearningRuntimeServices,
    'ready' | 'repository' | 'ensureCourseIndex'
  > = learningRuntimeServices,
): CatalogProgressMigrationPort {
  return {
    ready: services.ready,
    repository: services.repository,
    loadIndex: (entry) => loadCourseIndex(baseUrl, entry),
    ensureCourseIndex: (index) => services.ensureCourseIndex(index),
  };
}

export const ensureCatalogCourseIndexRevisions = ensureCatalogCourseRevisions;
export const createCatalogProgressIndexMigrationPort = createCatalogProgressMigrationPort;
