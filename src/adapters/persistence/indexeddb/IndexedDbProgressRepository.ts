/** ProgressRepository契約をversion 2 IndexedDB transactionへ実装する。 */
import type { IDBPDatabase } from 'idb';
import {
  CURRENT_PROGRESS_SCHEMA_VERSION,
  CourseProgressVersionConflictError,
  LeaseFenceRejectedError,
  type CourseProgress,
  type ExerciseDraft,
  type ProgressBackup,
  type ProgressRepository,
  type QuarantinedProgress,
  type RepositorySnapshot,
  type VersionedCourseProgress,
  type WorkspaceLeaseClaimResult,
  type WorkspaceLeaseProof,
} from '../../../core/persistence/contracts';
import { migrateRepositorySnapshot } from './migrateProgress';
import {
  openProgressDatabase,
  type ProgressMetadata,
  type ProgressDatabase,
  type ProgressDatabaseOpener,
  type WorkspaceLeaseMetadata,
} from './openProgressDatabase';

const RECORD_SCHEMA_VERSION_KEY = 'recordSchemaVersion';
const DATA_EPOCH_KEY = 'dataEpoch';

interface IndexedDbProgressRepositoryOptions {
  readonly now?: () => number;
  readonly isoNow?: () => string;
  readonly id?: () => string;
}

/** courseとworkspaceの衝突しない永続Draft keyを生成する。 */
function draftKey(courseId: string, workspaceId: string): string {
  return `${courseId}:${workspaceId}`;
}

/** delimiter衝突しないworkspace lease metadata keyを生成する。 */
function workspaceLeaseKey(courseId: string, workspaceId: string): string {
  return `workspaceLease:${JSON.stringify([courseId, workspaceId])}`;
}

/** Course CAS version用metadata keyを生成する。 */
function courseVersionKey(courseId: string): string {
  return `courseVersion:${JSON.stringify(courseId)}`;
}

/** metadata unionからdata epochを安全に読み、未初期化DBは0とする。 */
function dataEpochValue(metadata: ProgressMetadata | undefined): number {
  return metadata?.kind === 'data-epoch' && Number.isSafeInteger(metadata.value)
    ? metadata.value
    : 0;
}

/** metadata unionからCourse versionを安全に読み、未初期化recordは0とする。 */
function courseVersionValue(metadata: ProgressMetadata | undefined): number {
  return metadata?.kind === 'course-version' && Number.isSafeInteger(metadata.version)
    ? metadata.version
    : 0;
}

/** 全置換epochを下限に含め、未保存Courseのstale readも置換後に無効化する。 */
function canonicalCourseVersion(
  versionMetadata: ProgressMetadata | undefined,
  epochMetadata: ProgressMetadata | undefined,
): number {
  return Math.max(courseVersionValue(versionMetadata), dataEpochValue(epochMetadata));
}

/** 永続lease recordから外部proofだけを返す。 */
function leaseProof(metadata: WorkspaceLeaseMetadata): WorkspaceLeaseProof {
  const { courseId, workspaceId, ownerId, token, dataEpoch, expiresAt } = metadata;
  return { courseId, workspaceId, ownerId, token, dataEpoch, expiresAt };
}

/** 永続recordと提示proofの全fieldが一致するか判定する。 */
function sameLeaseProof(
  metadata: ProgressMetadata | undefined,
  proof: WorkspaceLeaseProof,
): metadata is WorkspaceLeaseMetadata {
  return (
    metadata?.kind === 'workspace-lease' &&
    metadata.courseId === proof.courseId &&
    metadata.workspaceId === proof.workspaceId &&
    metadata.ownerId === proof.ownerId &&
    metadata.token === proof.token &&
    metadata.dataEpoch === proof.dataEpoch &&
    metadata.expiresAt === proof.expiresAt
  );
}

/** SnapshotのMap keyが各recordのcanonical IDと一致することを保存前に検証する。 */
function assertSnapshotKeys(snapshot: RepositorySnapshot): void {
  for (const [key, progress] of Object.entries(snapshot.courses)) {
    if (key !== progress.courseId) {
      throw new Error(`CourseProgress keyがrecord IDと一致しません: ${key}`);
    }
  }
  for (const [key, draft] of Object.entries(snapshot.drafts)) {
    if (key !== draftKey(draft.courseId, draft.workspaceId)) {
      throw new Error(`ExerciseDraft keyがrecord IDと一致しません: ${key}`);
    }
  }
}

interface TransactionDonePort {
  readonly done: Promise<void>;
}

type TransactionOutcome =
  { readonly kind: 'complete' } | { readonly kind: 'failed'; readonly error: unknown };

type OperationOutcome<Result> =
  | { readonly kind: 'complete'; readonly result: Result }
  | { readonly kind: 'failed'; readonly error: unknown };

/** request失敗時もtransaction.doneを必ず観測し、request Errorをprimaryとして返す。 */
async function runObservedTransaction<Result>(
  transaction: TransactionDonePort,
  operation: () => Promise<Result>,
): Promise<Result> {
  const transactionOutcome: Promise<TransactionOutcome> = transaction.done.then(
    () => ({ kind: 'complete' }),
    (error: unknown) => ({ kind: 'failed', error }),
  );
  let operationPromise: Promise<Result>;
  try {
    operationPromise = operation();
  } catch (error) {
    await transactionOutcome;
    throw error;
  }
  const operationOutcome: OperationOutcome<Result> = await operationPromise.then(
    (result) => ({ kind: 'complete', result }),
    (error: unknown) => ({ kind: 'failed', error }),
  );
  const completed = await transactionOutcome;
  if (operationOutcome.kind === 'failed') throw operationOutcome.error;
  if (completed.kind === 'failed') throw completed.error;
  return operationOutcome.result;
}

/** IndexedDB接続・migration・全保存操作を原子的transactionへ閉じ込める。 */
export class IndexedDbProgressRepository implements ProgressRepository {
  #database: IDBPDatabase<ProgressDatabase> | undefined;
  readonly #now: () => number;
  readonly #isoNow: () => string;
  readonly #id: () => string;

  /** DB名とtest可能なopenerを保持し、実接続はopenまで開始しない。 */
  constructor(
    private readonly databaseName = 'tsumucode-progress',
    private readonly openDatabase: ProgressDatabaseOpener = openProgressDatabase,
    options: IndexedDbProgressRepositoryOptions = {},
  ) {
    this.#now = options.now ?? (() => Date.now());
    this.#isoNow = options.isoNow ?? (() => new Date().toISOString());
    this.#id = options.id ?? (() => crypto.randomUUID());
  }

  /** DBを開いて全recordを検証・移行し、schema v2 snapshotとして原子的に置換する。 */
  async open(): Promise<void> {
    this.close();
    const database = await this.openDatabase(this.databaseName);
    this.#database = database;
    try {
      const transaction = database.transaction(
        ['metadata', 'courses', 'drafts', 'quarantine'],
        'readonly',
      );
      const [metadata, courses, drafts, quarantined] = await runObservedTransaction(
        transaction,
        () =>
          Promise.all([
            transaction.objectStore('metadata').get('recordSchemaVersion'),
            transaction.objectStore('courses').getAll(),
            transaction.objectStore('drafts').getAll(),
            transaction.objectStore('quarantine').getAll(),
          ]),
      );
      const hasRecords = courses.length + drafts.length + quarantined.length > 0;
      const legacyMetadata = metadata as unknown as
        { readonly kind?: unknown; readonly value?: unknown } | undefined;
      const schemaVersion =
        typeof legacyMetadata?.value === 'number'
          ? legacyMetadata.value
          : hasRecords
            ? 1
            : CURRENT_PROGRESS_SCHEMA_VERSION;
      const migrated = migrateRepositorySnapshot(
        {
          schemaVersion,
          courses: Object.fromEntries(courses.map((course) => [course.courseId, course])),
          drafts: Object.fromEntries(drafts.map(({ key, ...draft }) => [key, draft])),
          ...(schemaVersion === CURRENT_PROGRESS_SCHEMA_VERSION ? { quarantined } : {}),
        },
        new Date().toISOString(),
      );
      if (schemaVersion !== CURRENT_PROGRESS_SCHEMA_VERSION) {
        await this.#replaceSnapshotRecords(migrated, 0, true);
      } else {
        await this.#ensureMetadata(Object.keys(migrated.courses));
      }
    } catch (error) {
      this.close();
      throw error;
    }
  }

  /** open済み接続を返し、lifecycle違反は永続API呼び出し前に拒否する。 */
  #db(): IDBPDatabase<ProgressDatabase> {
    if (!this.#database) throw new Error('ProgressRepository is not open');
    return this.#database;
  }

  /** schema/data epoch/Course version metadataを既存dataを消さずdiscriminated unionへ揃える。 */
  async #ensureMetadata(courseIds: readonly string[]): Promise<void> {
    const transaction = this.#db().transaction(['metadata'], 'readwrite');
    await runObservedTransaction(transaction, async () => {
      const store = transaction.objectStore('metadata');
      const currentEpoch = dataEpochValue(await store.get(DATA_EPOCH_KEY));
      await store.put({
        key: RECORD_SCHEMA_VERSION_KEY,
        kind: 'record-schema-version',
        value: CURRENT_PROGRESS_SCHEMA_VERSION,
      });
      await store.put({ key: DATA_EPOCH_KEY, kind: 'data-epoch', value: currentEpoch });
      for (const courseId of courseIds) {
        const key = courseVersionKey(courseId);
        const existing = await store.get(key);
        if (existing?.kind !== 'course-version') {
          await store.put({ key, kind: 'course-version', courseId, version: 0 });
        }
      }
    });
  }

  /** metadata store内のlease、data epoch、期限を同じtransaction時点で検証する。 */
  async #assertLeaseProof(
    store: { get(key: string): Promise<ProgressMetadata | undefined> },
    proof: WorkspaceLeaseProof,
  ): Promise<void> {
    const [stored, epoch] = await Promise.all([
      store.get(workspaceLeaseKey(proof.courseId, proof.workspaceId)),
      store.get(DATA_EPOCH_KEY),
    ]);
    if (
      !sameLeaseProof(stored, proof) ||
      dataEpochValue(epoch) !== proof.dataEpoch ||
      proof.expiresAt <= this.#now()
    ) {
      throw new LeaseFenceRejectedError();
    }
  }

  /** courseIdの進捗を読み取り、永続状態は変更しない。 */
  async getCourse(courseId: string): Promise<CourseProgress | undefined> {
    return this.#db().get('courses', courseId);
  }

  /** Courseとcanonical versionを同じreadonly transactionで読む。 */
  async getCourseVersioned(courseId: string): Promise<VersionedCourseProgress> {
    const transaction = this.#db().transaction(['courses', 'metadata'], 'readonly');
    const [progress, version, epoch] = await runObservedTransaction(transaction, () =>
      Promise.all([
        transaction.objectStore('courses').get(courseId),
        transaction.objectStore('metadata').get(courseVersionKey(courseId)),
        transaction.objectStore('metadata').get(DATA_EPOCH_KEY),
      ]),
    );
    return {
      ...(progress === undefined ? {} : { progress }),
      version: canonicalCourseVersion(version, epoch),
    };
  }

  /** courseId単位で進捗を上書き保存する。 */
  async putCourse(progress: CourseProgress): Promise<void> {
    const transaction = this.#db().transaction(['courses', 'metadata'], 'readwrite');
    await runObservedTransaction(transaction, async () => {
      const metadata = transaction.objectStore('metadata');
      const key = courseVersionKey(progress.courseId);
      const [versionMetadata, epochMetadata] = await Promise.all([
        metadata.get(key),
        metadata.get(DATA_EPOCH_KEY),
      ]);
      const version = canonicalCourseVersion(versionMetadata, epochMetadata);
      await transaction.objectStore('courses').put(progress);
      await metadata.put({
        key,
        kind: 'course-version',
        courseId: progress.courseId,
        version: version + 1,
      });
    });
  }

  /** Course canonical versionが期待値と一致するときだけ進捗を保存する。 */
  async putCourseVersioned(progress: CourseProgress, expectedVersion: number): Promise<number> {
    const transaction = this.#db().transaction(['courses', 'metadata'], 'readwrite');
    return runObservedTransaction(transaction, async () => {
      const metadata = transaction.objectStore('metadata');
      const key = courseVersionKey(progress.courseId);
      const [versionMetadata, epochMetadata] = await Promise.all([
        metadata.get(key),
        metadata.get(DATA_EPOCH_KEY),
      ]);
      const currentVersion = canonicalCourseVersion(versionMetadata, epochMetadata);
      if (currentVersion !== expectedVersion) throw new CourseProgressVersionConflictError();
      const nextVersion = currentVersion + 1;
      await transaction.objectStore('courses').put(progress);
      await metadata.put({
        key,
        kind: 'course-version',
        courseId: progress.courseId,
        version: nextVersion,
      });
      return nextVersion;
    });
  }

  /** courseId・workspaceIdのDraftを内部keyを除いて読み取る。 */
  async getDraft(courseId: string, workspaceId: string): Promise<ExerciseDraft | undefined> {
    const expectedKey = draftKey(courseId, workspaceId);
    const stored = await this.#db().get('drafts', expectedKey);
    if (!stored) return undefined;
    const { key: storedKey, ...draft } = stored;
    if (storedKey !== expectedKey) throw new Error('Stored Draft keyが一致しません');
    return draft;
  }

  /** courseId・workspaceId単位で最新Draftを上書き保存する。 */
  async putDraft(draft: ExerciseDraft): Promise<void> {
    await this.#db().put('drafts', {
      ...draft,
      key: draftKey(draft.courseId, draft.workspaceId),
    });
  }

  /** 永続proofをtransaction内で検証し、期限切れownerのDraft writeを拒否する。 */
  async putDraftFenced(draft: ExerciseDraft, proof: WorkspaceLeaseProof): Promise<void> {
    if (draft.courseId !== proof.courseId || draft.workspaceId !== proof.workspaceId) {
      throw new LeaseFenceRejectedError();
    }
    const transaction = this.#db().transaction(['drafts', 'metadata'], 'readwrite');
    await runObservedTransaction(transaction, async () => {
      await this.#assertLeaseProof(transaction.objectStore('metadata'), proof);
      await transaction.objectStore('drafts').put({
        ...draft,
        key: draftKey(draft.courseId, draft.workspaceId),
      });
    });
  }

  /** DraftとCourse進捗を同じreadwrite transactionで保存する。 */
  async putDraftAndCourse(draft: ExerciseDraft, progress: CourseProgress): Promise<void> {
    if (draft.courseId !== progress.courseId) {
      throw new Error('DraftとCourseProgressのcourseIdが一致しません');
    }
    const transaction = this.#db().transaction(['drafts', 'courses', 'metadata'], 'readwrite');
    await runObservedTransaction(transaction, async () => {
      const metadata = transaction.objectStore('metadata');
      const key = courseVersionKey(progress.courseId);
      const [versionMetadata, epochMetadata] = await Promise.all([
        metadata.get(key),
        metadata.get(DATA_EPOCH_KEY),
      ]);
      const version = canonicalCourseVersion(versionMetadata, epochMetadata);
      await transaction.objectStore('drafts').put({
        ...draft,
        key: draftKey(draft.courseId, draft.workspaceId),
      });
      await transaction.objectStore('courses').put(progress);
      await metadata.put({
        key,
        kind: 'course-version',
        courseId: progress.courseId,
        version: version + 1,
      });
    });
  }

  /** proofとCourse versionを同じtransactionでCASしてDraft・Courseを原子的保存する。 */
  async putDraftAndCourseFenced(
    draft: ExerciseDraft,
    progress: CourseProgress,
    proof: WorkspaceLeaseProof,
    expectedCourseVersion: number,
  ): Promise<number> {
    if (
      draft.courseId !== progress.courseId ||
      draft.courseId !== proof.courseId ||
      draft.workspaceId !== proof.workspaceId
    ) {
      throw new LeaseFenceRejectedError();
    }
    const transaction = this.#db().transaction(['drafts', 'courses', 'metadata'], 'readwrite');
    return runObservedTransaction(transaction, async () => {
      const metadata = transaction.objectStore('metadata');
      await this.#assertLeaseProof(metadata, proof);
      const versionKey = courseVersionKey(progress.courseId);
      const [versionMetadata, epochMetadata] = await Promise.all([
        metadata.get(versionKey),
        metadata.get(DATA_EPOCH_KEY),
      ]);
      const currentVersion = canonicalCourseVersion(versionMetadata, epochMetadata);
      if (currentVersion !== expectedCourseVersion) {
        throw new CourseProgressVersionConflictError();
      }
      const nextVersion = currentVersion + 1;
      await transaction.objectStore('drafts').put({
        ...draft,
        key: draftKey(draft.courseId, draft.workspaceId),
      });
      await transaction.objectStore('courses').put(progress);
      await metadata.put({
        key: versionKey,
        kind: 'course-version',
        courseId: progress.courseId,
        version: nextVersion,
      });
      return nextVersion;
    });
  }

  /** Course・Draft・quarantineを同じreadonly transactionのsnapshotとして返す。 */
  async snapshot(): Promise<RepositorySnapshot> {
    const transaction = this.#db().transaction(['courses', 'drafts', 'quarantine'], 'readonly');
    const [courseList, draftList, quarantined] = await runObservedTransaction(transaction, () =>
      Promise.all([
        transaction.objectStore('courses').getAll(),
        transaction.objectStore('drafts').getAll(),
        transaction.objectStore('quarantine').getAll(),
      ]),
    );
    return {
      schemaVersion: CURRENT_PROGRESS_SCHEMA_VERSION,
      courses: Object.fromEntries(courseList.map((course) => [course.courseId, course])),
      drafts: Object.fromEntries(draftList.map(({ key, ...draft }) => [key, draft])),
      quarantined,
    };
  }

  /** 全通常recordと隔離recordをschema v2 snapshotで原子的に置換する。 */
  async replaceSnapshot(snapshot: RepositorySnapshot): Promise<void> {
    await this.#replaceSnapshotRecords(snapshot, undefined, true);
  }

  /** Snapshot形式とcanonical Map keyをtransaction開始前に検証する。 */
  #assertSnapshot(snapshot: RepositorySnapshot): void {
    if (snapshot.schemaVersion !== CURRENT_PROGRESS_SCHEMA_VERSION) {
      throw new Error(
        `RepositorySnapshot schemaVersionが不正です: ${String(snapshot.schemaVersion)}`,
      );
    }
    assertSnapshotKeys(snapshot);
  }

  /** 全record置換、Course version再生成、epoch更新、lease無効化を一transactionで行う。 */
  async #replaceSnapshotRecords(
    snapshot: RepositorySnapshot,
    fixedDataEpoch: number | undefined,
    invalidateLeases: boolean,
  ): Promise<void> {
    this.#assertSnapshot(snapshot);
    const transaction = this.#db().transaction(
      ['courses', 'drafts', 'quarantine', 'metadata'],
      'readwrite',
    );
    await runObservedTransaction(transaction, async () => {
      const metadata = transaction.objectStore('metadata');
      const records = await metadata.getAll();
      const currentEpoch = dataEpochValue(records.find(({ key }) => key === DATA_EPOCH_KEY));
      const nextEpoch = fixedDataEpoch ?? currentEpoch + 1;
      await Promise.all([
        transaction.objectStore('courses').clear(),
        transaction.objectStore('drafts').clear(),
        transaction.objectStore('quarantine').clear(),
      ]);
      for (const record of records) {
        if (
          (fixedDataEpoch !== undefined && record.kind === 'course-version') ||
          (invalidateLeases && record.kind === 'workspace-lease')
        ) {
          await metadata.delete(record.key);
        }
      }
      for (const course of Object.values(snapshot.courses)) {
        await transaction.objectStore('courses').put(course);
      }
      const storedVersions = records.filter((record) => record.kind === 'course-version');
      const courseIds = new Set([
        ...storedVersions.map(({ courseId }) => courseId),
        ...Object.keys(snapshot.courses),
      ]);
      for (const courseId of courseIds) {
        const stored = storedVersions.find((record) => record.courseId === courseId);
        await metadata.put({
          key: courseVersionKey(courseId),
          kind: 'course-version',
          courseId,
          version:
            fixedDataEpoch === undefined ? Math.max(courseVersionValue(stored) + 1, nextEpoch) : 0,
        });
      }
      for (const [key, draft] of Object.entries(snapshot.drafts)) {
        await transaction.objectStore('drafts').put({ ...draft, key });
      }
      for (const record of snapshot.quarantined) {
        await transaction.objectStore('quarantine').put(record);
      }
      await metadata.put({
        key: RECORD_SCHEMA_VERSION_KEY,
        kind: 'record-schema-version',
        value: CURRENT_PROGRESS_SCHEMA_VERSION,
      });
      await metadata.put({ key: DATA_EPOCH_KEY, kind: 'data-epoch', value: nextEpoch });
    });
  }

  /** backup snapshot作成と全置換を同じtransactionに閉じ、途中writeを挟ませない。 */
  async replaceSnapshotWithBackup(
    snapshot: RepositorySnapshot,
    reason: ProgressBackup['reason'],
  ): Promise<ProgressBackup> {
    this.#assertSnapshot(snapshot);
    const transaction = this.#db().transaction(
      ['courses', 'drafts', 'quarantine', 'backups', 'metadata'],
      'readwrite',
    );
    return runObservedTransaction(transaction, async () => {
      const courses = transaction.objectStore('courses');
      const drafts = transaction.objectStore('drafts');
      const quarantine = transaction.objectStore('quarantine');
      const metadata = transaction.objectStore('metadata');
      const [courseList, draftList, quarantined, metadataRecords] = await Promise.all([
        courses.getAll(),
        drafts.getAll(),
        quarantine.getAll(),
        metadata.getAll(),
      ]);
      const currentEpoch = dataEpochValue(
        metadataRecords.find(({ key }) => key === DATA_EPOCH_KEY),
      );
      const nextEpoch = currentEpoch + 1;
      const backup: ProgressBackup = {
        id: this.#id(),
        reason,
        createdAt: this.#isoNow(),
        snapshot: {
          schemaVersion: CURRENT_PROGRESS_SCHEMA_VERSION,
          courses: Object.fromEntries(courseList.map((course) => [course.courseId, course])),
          drafts: Object.fromEntries(draftList.map(({ key, ...draft }) => [key, draft])),
          quarantined,
        },
      };
      await transaction.objectStore('backups').put(backup);
      await Promise.all([courses.clear(), drafts.clear(), quarantine.clear()]);
      for (const record of metadataRecords) {
        if (record.kind === 'workspace-lease') await metadata.delete(record.key);
      }
      for (const course of Object.values(snapshot.courses)) {
        await courses.put(course);
      }
      const storedVersions = metadataRecords.filter((record) => record.kind === 'course-version');
      const courseIds = new Set([
        ...storedVersions.map(({ courseId }) => courseId),
        ...Object.keys(snapshot.courses),
      ]);
      for (const courseId of courseIds) {
        const stored = storedVersions.find((record) => record.courseId === courseId);
        await metadata.put({
          key: courseVersionKey(courseId),
          kind: 'course-version',
          courseId,
          version: Math.max(courseVersionValue(stored) + 1, nextEpoch),
        });
      }
      for (const [key, draft] of Object.entries(snapshot.drafts)) {
        await drafts.put({ ...draft, key });
      }
      for (const record of snapshot.quarantined) await quarantine.put(record);
      await metadata.put({
        key: RECORD_SCHEMA_VERSION_KEY,
        kind: 'record-schema-version',
        value: CURRENT_PROGRESS_SCHEMA_VERSION,
      });
      await metadata.put({ key: DATA_EPOCH_KEY, kind: 'data-epoch', value: nextEpoch });
      return backup;
    });
  }

  /** 現在snapshotを指定理由のbackup recordとして保存する。 */
  async createBackup(reason: ProgressBackup['reason']): Promise<ProgressBackup> {
    const backup: ProgressBackup = {
      id: this.#id(),
      reason,
      createdAt: this.#isoNow(),
      snapshot: await this.snapshot(),
    };
    await this.#db().put('backups', backup);
    return backup;
  }

  /** 存在するbackup snapshotで通常・隔離recordを原子的に復元する。 */
  async restoreBackup(backupId: string): Promise<void> {
    const backup = await this.#db().get('backups', backupId);
    if (!backup) throw new Error(`Backup not found: ${backupId}`);
    await this.replaceSnapshot(backup.snapshot);
  }

  /** 解釈不能recordを通常dataと分離したstoreへ保存する。 */
  async quarantine(record: QuarantinedProgress): Promise<void> {
    await this.#db().put('quarantine', record);
  }

  /** IndexedDB metadata transactionをworkspace ownerの唯一の正本としてCAS claimする。 */
  async tryClaimWorkspaceLease(
    candidate: Omit<WorkspaceLeaseProof, 'dataEpoch'> & { readonly dataEpoch?: number },
  ): Promise<WorkspaceLeaseClaimResult> {
    const transaction = this.#db().transaction(['metadata'], 'readwrite');
    return runObservedTransaction(transaction, async () => {
      const store = transaction.objectStore('metadata');
      const [epochMetadata, existing] = await Promise.all([
        store.get(DATA_EPOCH_KEY),
        store.get(workspaceLeaseKey(candidate.courseId, candidate.workspaceId)),
      ]);
      const now = this.#now();
      const dataEpoch = dataEpochValue(epochMetadata);
      if (candidate.dataEpoch !== undefined && candidate.dataEpoch !== dataEpoch) {
        return { acquired: false, reason: 'data-epoch-mismatch' };
      }
      if (candidate.expiresAt <= now) return { acquired: false };
      if (
        existing?.kind === 'workspace-lease' &&
        existing.expiresAt > now &&
        existing.ownerId !== candidate.ownerId
      ) {
        return { acquired: false, owner: leaseProof(existing) };
      }
      const proof: WorkspaceLeaseProof = {
        courseId: candidate.courseId,
        workspaceId: candidate.workspaceId,
        ownerId: candidate.ownerId,
        token: candidate.token,
        dataEpoch,
        expiresAt: candidate.expiresAt,
      };
      const record: WorkspaceLeaseMetadata = {
        key: workspaceLeaseKey(candidate.courseId, candidate.workspaceId),
        kind: 'workspace-lease',
        ...proof,
      };
      await store.put(record);
      return { acquired: true, proof };
    });
  }

  /** workspace owner正本をreadonly transactionで返す。 */
  async readWorkspaceLease(
    courseId: string,
    workspaceId: string,
  ): Promise<WorkspaceLeaseProof | undefined> {
    const metadata = await this.#db().get('metadata', workspaceLeaseKey(courseId, workspaceId));
    return metadata?.kind === 'workspace-lease' ? leaseProof(metadata) : undefined;
  }

  /** proof全fieldと期限をCASし、現在ownerだけheartbeatを更新する。 */
  async heartbeatWorkspaceLease(
    proof: WorkspaceLeaseProof,
    expiresAt: number,
  ): Promise<WorkspaceLeaseProof> {
    const transaction = this.#db().transaction(['metadata'], 'readwrite');
    return runObservedTransaction(transaction, async () => {
      const store = transaction.objectStore('metadata');
      await this.#assertLeaseProof(store, proof);
      if (expiresAt <= this.#now()) throw new LeaseFenceRejectedError();
      const refreshed = { ...proof, expiresAt };
      await store.put({
        key: workspaceLeaseKey(proof.courseId, proof.workspaceId),
        kind: 'workspace-lease',
        ...refreshed,
      });
      return refreshed;
    });
  }

  /** proof全fieldと期限をCASし、永続owner削除へ成功した場合だけtrueを返す。 */
  async releaseWorkspaceLease(proof: WorkspaceLeaseProof): Promise<boolean> {
    const transaction = this.#db().transaction(['metadata'], 'readwrite');
    return runObservedTransaction(transaction, async () => {
      const store = transaction.objectStore('metadata');
      try {
        await this.#assertLeaseProof(store, proof);
      } catch (error) {
        if (error instanceof LeaseFenceRejectedError) return false;
        throw error;
      }
      await store.delete(workspaceLeaseKey(proof.courseId, proof.workspaceId));
      return true;
    });
  }

  /** open済み接続を解放し、以後の操作を次のopenまで拒否する。 */
  close(): void {
    this.#database?.close();
    this.#database = undefined;
  }
}
