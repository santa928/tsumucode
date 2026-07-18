/** TsumuCode進捗用IndexedDBのobject storeとDB versionを一元管理する。 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  CourseProgress,
  ExerciseDraft,
  ProgressBackup,
  QuarantinedProgress,
  WorkspaceLeaseProof,
} from '../../../core/persistence/contracts';

export interface StoredDraft extends ExerciseDraft {
  readonly key: string;
}

export interface RecordSchemaVersionMetadata {
  readonly key: 'recordSchemaVersion';
  readonly kind: 'record-schema-version';
  readonly value: number;
}

export interface DataEpochMetadata {
  readonly key: 'dataEpoch';
  readonly kind: 'data-epoch';
  readonly value: number;
}

export interface WorkspaceLeaseMetadata extends WorkspaceLeaseProof {
  readonly key: string;
  readonly kind: 'workspace-lease';
}

export interface CourseVersionMetadata {
  readonly key: string;
  readonly kind: 'course-version';
  readonly courseId: string;
  readonly version: number;
}

export type ProgressMetadata =
  RecordSchemaVersionMetadata | DataEpochMetadata | WorkspaceLeaseMetadata | CourseVersionMetadata;

export interface ProgressDatabase extends DBSchema {
  courses: { key: string; value: CourseProgress };
  drafts: { key: string; value: StoredDraft };
  backups: { key: string; value: ProgressBackup };
  quarantine: { key: string; value: QuarantinedProgress };
  metadata: { key: string; value: ProgressMetadata };
}

export type ProgressDatabaseOpener = (name: string) => Promise<IDBPDatabase<ProgressDatabase>>;

/** DB version 2を開き、初回storeとv2のquarantine／metadata storeをupgrade時だけ作る。 */
export function openProgressDatabase(
  name = 'tsumucode-progress',
): Promise<IDBPDatabase<ProgressDatabase>> {
  return openDB<ProgressDatabase>(name, 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('courses', { keyPath: 'courseId' });
        database.createObjectStore('drafts', { keyPath: 'key' });
        database.createObjectStore('backups', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        database.createObjectStore('quarantine', { keyPath: 'id' });
        database.createObjectStore('metadata', { keyPath: 'key' });
      }
    },
  });
}
