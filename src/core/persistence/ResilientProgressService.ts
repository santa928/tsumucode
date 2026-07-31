/** 永続障害時も最新学習状態をmemoryへ救済し、明示復旧まで無断上書きしないRepository。 */
import { canonicalJson } from './canonicalJson';
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
} from './contracts';

export type PersistenceHealthKind =
  'initializing' | 'healthy' | 'memory-only' | 'retrying' | 'conflict';
export type PersistenceFailureKind = 'open' | 'read' | 'quota' | 'write' | 'transaction';
export type PersistenceConflictResolution = 'keep-device' | 'use-memory';

export interface PersistenceHealthSnapshot {
  readonly kind: PersistenceHealthKind;
  readonly cause?: PersistenceFailureKind;
  readonly hasUnsavedChanges: boolean;
}

export type PersistenceRetryResult = { readonly kind: 'recovered' } | { readonly kind: 'conflict' };

/** durableへ書けない状態で操作を継続したことを呼出側へ通知する公開Error。 */
export class PersistenceUnavailableError extends Error {
  constructor(readonly causeKind: PersistenceFailureKind) {
    super('端末の永続領域へ保存できないため、学習内容を一時的にmemoryへ保持しました');
    this.name = 'PersistenceUnavailableError';
  }
}

const EMPTY_SNAPSHOT: RepositorySnapshot = {
  schemaVersion: CURRENT_PROGRESS_SCHEMA_VERSION,
  courses: {},
  drafts: {},
  quarantined: [],
};

/** Repository値を呼出側と共有しないstructured cloneとして返す。 */
function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

/** Courseとworkspaceの既存Repository規則に合うDraft keyを返す。 */
function draftKey(courseId: string, workspaceId: string): string {
  return `${courseId}:${workspaceId}`;
}

/** snapshotがdurable recordを一件も持たないか判定する。 */
function isEmptySnapshot(snapshot: RepositorySnapshot): boolean {
  return (
    Object.keys(snapshot.courses).length === 0 &&
    Object.keys(snapshot.drafts).length === 0 &&
    snapshot.quarantined.length === 0
  );
}

/** JSON-safeなRepository snapshotを内容同値で比較する。 */
function snapshotsEqual(left: RepositorySnapshot, right: RepositorySnapshot): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/** optionalな単一Repository recordを全snapshotへ展開せず内容比較する。 */
function optionalRecordsEqual<Value>(left: Value | undefined, right: Value | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}

/** revision・保存時刻を除く全Draft状態が同一で、救済分岐を包含すると判定できるか返す。 */
function draftsHaveEquivalentRecoveryState(left: ExerciseDraft, right: ExerciseDraft): boolean {
  return (
    canonicalJson({ ...left, editRevision: 0, updatedAt: '' }) ===
    canonicalJson({ ...right, editRevision: 0, updatedAt: '' })
  );
}

/** Browser由来Errorを内部詳細なしの公開health分類へ変換する。 */
function classifyFailure(
  error: unknown,
  fallback: Exclude<PersistenceFailureKind, 'quota' | 'transaction'>,
): PersistenceFailureKind {
  const candidateName =
    typeof error === 'object' && error !== null
      ? (error as { readonly name?: unknown }).name
      : undefined;
  const name = typeof candidateName === 'string' ? candidateName : undefined;
  if (name === 'QuotaExceededError') return 'quota';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (name === 'AbortError' || /transaction|abort/u.test(message)) return 'transaction';
  return fallback;
}

/** health objectの値同一性を比較し、不要なstore通知を避ける。 */
function sameHealth(left: PersistenceHealthSnapshot, right: PersistenceHealthSnapshot): boolean {
  return (
    left.kind === right.kind &&
    left.cause === right.cause &&
    left.hasUnsavedChanges === right.hasUnsavedChanges
  );
}

/** stale ownerまたはCourse CAS競合を端末障害のmemory救済から分離する。 */
function isLogicalWriteRejection(
  error: unknown,
): error is LeaseFenceRejectedError | CourseProgressVersionConflictError {
  return (
    error instanceof LeaseFenceRejectedError || error instanceof CourseProgressVersionConflictError
  );
}

/** Memory救済、baseline比較、backup-first復旧をProgressRepository契約の内側へ提供する。 */
export class ResilientProgressService implements ProgressRepository {
  readonly #healthListeners = new Set<() => void>();
  readonly #dataListeners = new Set<() => void>();
  readonly #memoryBackups = new Map<string, RepositorySnapshot>();
  readonly #emergencyDrafts = new Map<string, ExerciseDraft>();
  #health: PersistenceHealthSnapshot = {
    kind: 'initializing',
    hasUnsavedChanges: false,
  };
  #memory: RepositorySnapshot = clone(EMPTY_SNAPSHOT);
  #baseline: RepositorySnapshot | undefined;
  #conflictingDurable: RepositorySnapshot | undefined;
  #openPromise: Promise<void> | undefined;
  #retryPromise: Promise<PersistenceRetryResult> | undefined;
  #durableWriteTail: Promise<void> = Promise.resolve();
  #pendingDurableWrites = 0;
  #memoryBackupSequence = 0;
  #dataRevision = 0;

  constructor(private readonly delegate: ProgressRepository) {}

  /** useSyncExternalStore向けの参照安定health snapshotを返す。 */
  readonly getHealthSnapshot = (): PersistenceHealthSnapshot => this.#health;

  /** Repository内容変更を検出する単調増加revisionを返す。 */
  readonly getDataRevision = (): number => this.#dataRevision;

  /** health変更listenerを購読し、冪等な解除関数を返す。 */
  readonly subscribeHealth = (listener: () => void): (() => void) => {
    this.#healthListeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#healthListeners.delete(listener);
    };
  };

  /** data revision変更listenerを購読し、冪等な解除関数を返す。 */
  readonly subscribeData = (listener: () => void): (() => void) => {
    this.#dataListeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#dataListeners.delete(listener);
    };
  };

  /** 値が変わったhealthだけをpublishする。 */
  #publishHealth(next: PersistenceHealthSnapshot): void {
    if (sameHealth(this.#health, next)) return;
    this.#health = next;
    for (const listener of [...this.#healthListeners]) listener();
  }

  /** Memory snapshotの実変更または明示epochだけをpublishし、read購読loopを防ぐ。 */
  #commitMemory(next: RepositorySnapshot, forceEpoch = false): void {
    if (!forceEpoch && snapshotsEqual(this.#memory, next)) return;
    this.#memory = clone(next);
    this.#dataRevision += 1;
    for (const listener of [...this.#dataListeners]) listener();
  }

  /** 内部でclone済みrecordから組み立てた不変snapshotを再cloneせずmemoryへ採用する。 */
  #commitPreparedMemory(next: RepositorySnapshot): void {
    this.#memory = next;
    this.#dataRevision += 1;
    for (const listener of [...this.#dataListeners]) listener();
  }

  /** durable baselineを呼出側と共有しない値へ更新する。 */
  #commitBaseline(next: RepositorySnapshot): void {
    this.#baseline = clone(next);
  }

  /** 内部所有の不変snapshotをmemoryと共有可能なbaselineとして採用する。 */
  #commitPreparedBaseline(next: RepositorySnapshot): void {
    this.#baseline = next;
  }

  /** 現在のmemoryをbaselineとしてhealthyへ確定する。 */
  #markHealthy(): void {
    this.#commitBaseline(this.#memory);
    this.#conflictingDurable = undefined;
    this.#publishHealth({ kind: 'healthy', hasUnsavedChanges: false });
  }

  /** 永続失敗をmemory-onlyへ変換し、救済中変更の有無を保持する。 */
  #markUnavailable(cause: PersistenceFailureKind, hasUnsavedChanges: boolean): void {
    this.#publishHealth({ kind: 'memory-only', cause, hasUnsavedChanges });
  }

  /** durable mutationを種類に関係なく一列へ並べ、全置換をexclusive barrierにする。 */
  #enqueueExclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.#pendingDurableWrites += 1;
    const queued = this.#durableWriteTail.then(operation);
    const settled = queued.finally(() => {
      this.#pendingDurableWrites -= 1;
    });
    this.#durableWriteTail = settled.then(
      () => undefined,
      () => undefined,
    );
    return settled;
  }

  /** durable writeを呼出順に直列化し、成功baselineとmemory overlayを混同しない。 */
  #enqueueDurableWrite(
    committedSnapshot: RepositorySnapshot,
    operation: () => Promise<void>,
  ): Promise<void> {
    return this.#enqueueExclusive(async () => {
      if (this.#health.kind !== 'healthy') {
        const cause = this.#health.cause ?? 'write';
        this.#publishHealth({ ...this.#health, hasUnsavedChanges: true });
        throw new PersistenceUnavailableError(cause);
      }
      try {
        await operation();
        this.#commitBaseline(committedSnapshot);
        if (snapshotsEqual(this.#memory, committedSnapshot)) this.#markHealthy();
      } catch (error: unknown) {
        this.#markUnavailable(classifyFailure(error, 'write'), true);
        throw error;
      }
    });
  }

  /** 既存openをsingle-flightにし、失敗は空または既存memoryで継続可能にする。 */
  open(): Promise<void> {
    if (this.#openPromise !== undefined) return this.#openPromise;
    let stage: 'open' | 'read' = 'open';
    const operation = (async () => {
      try {
        await this.delegate.open();
        stage = 'read';
        const durable = await this.delegate.snapshot();
        this.#commitMemory(durable);
        this.#markHealthy();
      } catch (error: unknown) {
        this.delegate.close();
        this.#baseline = undefined;
        this.#markUnavailable(classifyFailure(error, stage), this.#health.hasUnsavedChanges);
      }
    })();
    const guarded = operation.finally(() => {
      if (this.#openPromise === guarded) this.#openPromise = undefined;
    });
    this.#openPromise = guarded;
    return guarded;
  }

  /** healthy時のCourse readをmemory／baselineへ反映し、失敗時はcached値へfallbackする。 */
  async getCourse(courseId: string): Promise<CourseProgress | undefined> {
    if (this.#health.kind !== 'healthy' || this.#pendingDurableWrites > 0) {
      return clone(this.#memory.courses[courseId]);
    }
    try {
      const value = await this.delegate.getCourse(courseId);
      const courses: Record<string, CourseProgress> = Object.fromEntries(
        Object.entries(this.#memory.courses).filter(([key]) => key !== courseId),
      );
      if (value !== undefined) courses[courseId] = clone(value);
      const next = { ...this.#memory, courses };
      this.#commitMemory(next);
      this.#commitBaseline(next);
      return clone(value);
    } catch (error: unknown) {
      this.#markUnavailable(classifyFailure(error, 'read'), false);
      return clone(this.#memory.courses[courseId]);
    }
  }

  /** Course進捗と永続CAS versionを読み、進捗値だけmemory cacheへ反映する。 */
  async getCourseVersioned(courseId: string): Promise<VersionedCourseProgress> {
    if (this.getHealthSnapshot().kind !== 'healthy') {
      const progress = this.#memory.courses[courseId];
      return { ...(progress === undefined ? {} : { progress: clone(progress) }), version: 0 };
    }
    while (this.#pendingDurableWrites > 0) await this.#durableWriteTail;
    if (this.#health.kind !== 'healthy') {
      const progress = this.#memory.courses[courseId];
      return { ...(progress === undefined ? {} : { progress: clone(progress) }), version: 0 };
    }
    try {
      const versioned = await this.delegate.getCourseVersioned(courseId);
      if (!optionalRecordsEqual(this.#memory.courses[courseId], versioned.progress)) {
        const courses: Record<string, CourseProgress> = Object.fromEntries(
          Object.entries(this.#memory.courses).filter(([key]) => key !== courseId),
        );
        if (versioned.progress !== undefined) courses[courseId] = clone(versioned.progress);
        const next = { ...this.#memory, courses };
        this.#commitPreparedMemory(next);
        this.#commitPreparedBaseline(next);
      }
      return clone(versioned);
    } catch (error: unknown) {
      this.#markUnavailable(classifyFailure(error, 'read'), false);
      const progress = this.#memory.courses[courseId];
      return { ...(progress === undefined ? {} : { progress: clone(progress) }), version: 0 };
    }
  }

  /** Course writeをmemoryへ先行反映し、durable失敗時はrejectしつつ救済を維持する。 */
  async putCourse(progress: CourseProgress): Promise<void> {
    const next = {
      ...this.#memory,
      courses: { ...this.#memory.courses, [progress.courseId]: clone(progress) },
    };
    this.#commitMemory(next, true);
    if (this.#health.kind !== 'healthy') {
      const cause = this.#health.cause ?? 'write';
      this.#publishHealth({ ...this.#health, hasUnsavedChanges: true });
      throw new PersistenceUnavailableError(cause);
    }
    return this.#enqueueDurableWrite(next, () => this.delegate.putCourse(progress));
  }

  /** Course CAS成功後だけmemoryを更新し、version競合は呼出側の再計算へ返す。 */
  async putCourseVersioned(progress: CourseProgress, expectedVersion: number): Promise<number> {
    return this.#enqueueExclusive(async () => {
      if (this.#health.kind !== 'healthy') {
        const next = {
          ...this.#memory,
          courses: { ...this.#memory.courses, [progress.courseId]: clone(progress) },
        };
        this.#commitMemory(next, true);
        this.#publishHealth({ ...this.#health, hasUnsavedChanges: true });
        throw new PersistenceUnavailableError(this.#health.cause ?? 'write');
      }
      try {
        const nextVersion = await this.delegate.putCourseVersioned(progress, expectedVersion);
        const next = {
          ...this.#memory,
          courses: { ...this.#memory.courses, [progress.courseId]: clone(progress) },
        };
        this.#commitMemory(next, true);
        this.#commitBaseline(next);
        return nextVersion;
      } catch (error: unknown) {
        if (isLogicalWriteRejection(error)) throw error;
        const rescued = {
          ...this.#memory,
          courses: { ...this.#memory.courses, [progress.courseId]: clone(progress) },
        };
        this.#commitMemory(rescued, true);
        this.#markUnavailable(classifyFailure(error, 'write'), true);
        throw error;
      }
    });
  }

  /** healthy時のDraft readをmemory／baselineへ反映し、失敗時はcached値へfallbackする。 */
  async getDraft(courseId: string, workspaceId: string): Promise<ExerciseDraft | undefined> {
    const key = draftKey(courseId, workspaceId);
    if (this.#health.kind !== 'healthy' || this.#pendingDurableWrites > 0) {
      return clone(this.#memory.drafts[key]);
    }
    try {
      const value = await this.delegate.getDraft(courseId, workspaceId);
      const drafts: Record<string, ExerciseDraft> = Object.fromEntries(
        Object.entries(this.#memory.drafts).filter(([storedKey]) => storedKey !== key),
      );
      if (value !== undefined) drafts[key] = clone(value);
      const next = { ...this.#memory, drafts };
      this.#commitMemory(next);
      this.#commitBaseline(next);
      return clone(value);
    } catch (error: unknown) {
      this.#markUnavailable(classifyFailure(error, 'read'), false);
      return clone(this.#memory.drafts[key]);
    }
  }

  /** Draft writeをmemoryへ保持し、永続失敗を呼出側とhealthへ通知する。 */
  async putDraft(draft: ExerciseDraft): Promise<void> {
    const key = draftKey(draft.courseId, draft.workspaceId);
    const next = {
      ...this.#memory,
      drafts: { ...this.#memory.drafts, [key]: clone(draft) },
    };
    this.#commitMemory(next, true);
    if (this.#health.kind !== 'healthy') {
      const cause = this.#health.cause ?? 'write';
      this.#publishHealth({ ...this.#health, hasUnsavedChanges: true });
      throw new PersistenceUnavailableError(cause);
    }
    return this.#enqueueDurableWrite(next, () => this.delegate.putDraft(draft));
  }

  /** fence成功後だけmemoryへcommitし、stale拒否は救済data・healthへ混ぜない。 */
  async putDraftFenced(draft: ExerciseDraft, proof: WorkspaceLeaseProof): Promise<void> {
    return this.#enqueueExclusive(async () => {
      if (this.#health.kind !== 'healthy') {
        const key = draftKey(draft.courseId, draft.workspaceId);
        this.#commitMemory(
          {
            ...this.#memory,
            drafts: { ...this.#memory.drafts, [key]: clone(draft) },
          },
          true,
        );
        this.#publishHealth({ ...this.#health, hasUnsavedChanges: true });
        throw new PersistenceUnavailableError(this.#health.cause ?? 'write');
      }
      try {
        await this.delegate.putDraftFenced(draft, proof);
        this.#discardCoveredEmergencyDraft(draft);
        const key = draftKey(draft.courseId, draft.workspaceId);
        const next = {
          ...this.#memory,
          drafts: { ...this.#memory.drafts, [key]: clone(draft) },
        };
        this.#commitPreparedMemory(next);
        this.#commitPreparedBaseline(next);
      } catch (error: unknown) {
        if (isLogicalWriteRejection(error)) throw error;
        const key = draftKey(draft.courseId, draft.workspaceId);
        const rescued = {
          ...this.#memory,
          drafts: { ...this.#memory.drafts, [key]: clone(draft) },
        };
        this.#commitMemory(rescued, true);
        this.#markUnavailable(classifyFailure(error, 'write'), true);
        throw error;
      }
    });
  }

  /** DraftとCourseをmemoryでも一度の差替えで更新し、片側だけの救済を残さない。 */
  async putDraftAndCourse(draft: ExerciseDraft, progress: CourseProgress): Promise<void> {
    if (draft.courseId !== progress.courseId) {
      throw new Error('DraftとCourseProgressのcourseIdが一致しません');
    }
    const key = draftKey(draft.courseId, draft.workspaceId);
    const next = {
      ...this.#memory,
      courses: { ...this.#memory.courses, [progress.courseId]: clone(progress) },
      drafts: { ...this.#memory.drafts, [key]: clone(draft) },
    };
    this.#commitMemory(next, true);
    if (this.#health.kind !== 'healthy') {
      const cause = this.#health.cause ?? 'write';
      this.#publishHealth({ ...this.#health, hasUnsavedChanges: true });
      throw new PersistenceUnavailableError(cause);
    }
    return this.#enqueueDurableWrite(next, () => this.delegate.putDraftAndCourse(draft, progress));
  }

  /** fence／Course version CAS成功後だけmemoryへcommitし、論理競合は呼出側retryへ返す。 */
  async putDraftAndCourseFenced(
    draft: ExerciseDraft,
    progress: CourseProgress,
    proof: WorkspaceLeaseProof,
    expectedCourseVersion: number,
  ): Promise<number> {
    if (draft.courseId !== progress.courseId) {
      throw new Error('DraftとCourseProgressのcourseIdが一致しません');
    }
    return this.#enqueueExclusive(async () => {
      if (this.#health.kind !== 'healthy') {
        const key = draftKey(draft.courseId, draft.workspaceId);
        this.#commitMemory(
          {
            ...this.#memory,
            courses: { ...this.#memory.courses, [progress.courseId]: clone(progress) },
            drafts: { ...this.#memory.drafts, [key]: clone(draft) },
          },
          true,
        );
        this.#publishHealth({ ...this.#health, hasUnsavedChanges: true });
        throw new PersistenceUnavailableError(this.#health.cause ?? 'write');
      }
      try {
        const nextVersion = await this.delegate.putDraftAndCourseFenced(
          draft,
          progress,
          proof,
          expectedCourseVersion,
        );
        this.#discardCoveredEmergencyDraft(draft);
        const key = draftKey(draft.courseId, draft.workspaceId);
        const next = {
          ...this.#memory,
          courses: { ...this.#memory.courses, [progress.courseId]: clone(progress) },
          drafts: { ...this.#memory.drafts, [key]: clone(draft) },
        };
        this.#commitPreparedMemory(next);
        this.#commitPreparedBaseline(next);
        return nextVersion;
      } catch (error: unknown) {
        if (isLogicalWriteRejection(error)) throw error;
        const key = draftKey(draft.courseId, draft.workspaceId);
        const rescued = {
          ...this.#memory,
          courses: { ...this.#memory.courses, [progress.courseId]: clone(progress) },
          drafts: { ...this.#memory.drafts, [key]: clone(draft) },
        };
        this.#commitMemory(rescued, true);
        this.#markUnavailable(classifyFailure(error, 'write'), true);
        throw error;
      }
    });
  }

  /** healthy時はdurable全体を再読込し、障害時はmemory込みsnapshotを返す。 */
  async snapshot(): Promise<RepositorySnapshot> {
    if (this.#health.kind !== 'healthy' || this.#pendingDurableWrites > 0) {
      return clone(this.#memory);
    }
    try {
      const durable = await this.delegate.snapshot();
      this.#commitMemory(durable);
      this.#commitBaseline(durable);
      return clone(durable);
    } catch (error: unknown) {
      this.#markUnavailable(classifyFailure(error, 'read'), false);
      return clone(this.#memory);
    }
  }

  /** Import／削除相当の全置換はdurable成功後だけmemoryへcommitする。 */
  async replaceSnapshot(snapshot: RepositorySnapshot): Promise<void> {
    return this.#enqueueExclusive(async () => {
      if (this.#health.kind !== 'healthy') {
        throw new PersistenceUnavailableError(this.#health.cause ?? 'write');
      }
      try {
        await this.delegate.replaceSnapshot(snapshot);
        this.#commitMemory(snapshot, true);
        this.#markHealthy();
      } catch (error: unknown) {
        this.#markUnavailable(classifyFailure(error, 'write'), false);
        throw error;
      }
    });
  }

  /** backup＋全置換を通常writeと同じexclusive queueへ置く。 */
  async replaceSnapshotWithBackup(
    snapshot: RepositorySnapshot,
    reason: ProgressBackup['reason'],
  ): Promise<ProgressBackup> {
    return this.#enqueueExclusive(async () => {
      if (this.#health.kind !== 'healthy') {
        throw new PersistenceUnavailableError(this.#health.cause ?? 'write');
      }
      try {
        const backup = await this.delegate.replaceSnapshotWithBackup(snapshot, reason);
        this.#commitMemory(snapshot, true);
        this.#markHealthy();
        return backup;
      } catch (error: unknown) {
        this.#markUnavailable(classifyFailure(error, 'write'), false);
        throw error;
      }
    });
  }

  /** healthy時はdurable backupを作り、degraded時はrollback用memory backupだけを作る。 */
  async createBackup(reason: ProgressBackup['reason']): Promise<ProgressBackup> {
    await this.#durableWriteTail;
    if (this.#health.kind === 'healthy') {
      try {
        return await this.delegate.createBackup(reason);
      } catch (error: unknown) {
        this.#markUnavailable(classifyFailure(error, 'write'), false);
        throw error;
      }
    }
    this.#memoryBackupSequence += 1;
    const backup: ProgressBackup = {
      id: `memory-backup-${String(this.#memoryBackupSequence)}`,
      reason,
      createdAt: new Date().toISOString(),
      snapshot: clone(this.#memory),
    };
    this.#memoryBackups.set(backup.id, clone(backup.snapshot));
    return backup;
  }

  /** memory backupまたはdurable backupを復元し、成功時はdata revisionを進める。 */
  async restoreBackup(backupId: string): Promise<void> {
    return this.#enqueueExclusive(async () => {
      const memoryBackup = this.#memoryBackups.get(backupId);
      if (memoryBackup !== undefined) {
        this.#commitMemory(memoryBackup, true);
        return;
      }
      try {
        await this.delegate.restoreBackup(backupId);
        const restored = await this.delegate.snapshot();
        this.#commitMemory(restored, true);
        this.#markHealthy();
      } catch (error: unknown) {
        this.#markUnavailable(classifyFailure(error, 'write'), this.#health.hasUnsavedChanges);
        throw error;
      }
    });
  }

  /** quarantine writeもmemoryへ保持し、durable失敗時は同じ救済規則でrejectする。 */
  async quarantine(record: QuarantinedProgress): Promise<void> {
    const next = {
      ...this.#memory,
      quarantined: [...this.#memory.quarantined, clone(record)],
    };
    this.#commitMemory(next, true);
    if (this.#health.kind !== 'healthy') {
      const cause = this.#health.cause ?? 'write';
      this.#publishHealth({ ...this.#health, hasUnsavedChanges: true });
      throw new PersistenceUnavailableError(cause);
    }
    return this.#enqueueDurableWrite(next, () => this.delegate.quarantine(record));
  }

  /** recovery前にmemory snapshotをbackup-firstでdurableへ置換する。 */
  async #applyMemoryToDurable(memory: RepositorySnapshot): Promise<void> {
    await this.delegate.replaceSnapshotWithBackup(memory, 'recovery');
  }

  /** recovery中にmemoryが進んだ場合は最新revisionを再反映し、同一turn内だけhealthy確定する。 */
  async #recoverLatestMemoryToHealthy(): Promise<void> {
    for (;;) {
      const revision = this.#dataRevision;
      const memory = clone(this.#memory);
      await this.#applyMemoryToDurable(memory);
      if (revision === this.#dataRevision) {
        this.#markHealthy();
        return;
      }
    }
  }

  /** durableを再openし、baselineが変わっていない場合だけmemoryを安全に反映する。 */
  retry(): Promise<PersistenceRetryResult> {
    if (this.#health.kind === 'healthy') return Promise.resolve({ kind: 'recovered' });
    if (this.#health.kind === 'conflict') return Promise.resolve({ kind: 'conflict' });
    if (this.#retryPromise !== undefined) return this.#retryPromise;
    const baseline = this.#baseline === undefined ? undefined : clone(this.#baseline);
    const retryStartRevision = this.#dataRevision;
    const retryStartedWithUnsavedChanges = this.#health.hasUnsavedChanges;
    let stage: 'open' | 'read' | 'write' = 'open';
    this.#publishHealth({
      kind: 'retrying',
      ...(this.#health.cause === undefined ? {} : { cause: this.#health.cause }),
      hasUnsavedChanges: retryStartedWithUnsavedChanges,
    });
    const operation = (async (): Promise<PersistenceRetryResult> => {
      try {
        await this.#durableWriteTail;
        this.delegate.close();
        await this.delegate.open();
        stage = 'read';
        const durable = await this.delegate.snapshot();
        const memory = clone(this.#memory);
        const hasUnsavedChanges =
          retryStartedWithUnsavedChanges ||
          this.#health.hasUnsavedChanges ||
          this.#dataRevision !== retryStartRevision;
        if (!hasUnsavedChanges || snapshotsEqual(durable, memory)) {
          this.#commitMemory(durable, true);
          this.#markHealthy();
          return { kind: 'recovered' };
        }
        const canApply =
          (baseline !== undefined && snapshotsEqual(durable, baseline)) ||
          (baseline === undefined && isEmptySnapshot(durable));
        if (!canApply) {
          this.#conflictingDurable = clone(durable);
          this.#publishHealth({ kind: 'conflict', hasUnsavedChanges: true });
          return { kind: 'conflict' };
        }
        stage = 'write';
        await this.#recoverLatestMemoryToHealthy();
        return { kind: 'recovered' };
      } catch (error: unknown) {
        const fallback = stage === 'open' ? 'open' : stage === 'read' ? 'read' : 'write';
        const hasUnsavedChanges =
          retryStartedWithUnsavedChanges ||
          this.#health.hasUnsavedChanges ||
          this.#dataRevision !== retryStartRevision;
        this.#markUnavailable(classifyFailure(error, fallback), hasUnsavedChanges);
        throw error;
      }
    })();
    const guarded = operation.finally(() => {
      if (this.#retryPromise === guarded) this.#retryPromise = undefined;
    });
    this.#retryPromise = guarded;
    return guarded;
  }

  /** conflictを利用者選択どおり解決し、memory反映時だけbackup-first writeを行う。 */
  async resolveConflict(resolution: PersistenceConflictResolution): Promise<void> {
    if (this.#health.kind !== 'conflict' || this.#conflictingDurable === undefined) {
      throw new Error('解決待ちの保存競合がありません');
    }
    if (resolution === 'keep-device') {
      this.#commitMemory(this.#conflictingDurable, true);
      this.#markHealthy();
      return;
    }
    this.#publishHealth({ kind: 'retrying', cause: 'write', hasUnsavedChanges: true });
    try {
      await this.#recoverLatestMemoryToHealthy();
    } catch (error: unknown) {
      this.#publishHealth({ kind: 'conflict', hasUnsavedChanges: true });
      throw error;
    }
  }

  /** 失効leaseのDraftを正本cacheに混ぜず、タブ内の緊急Export overlayへ保持する。 */
  retainEmergencyDraft(draft: ExerciseDraft): void {
    const key = draftKey(draft.courseId, draft.workspaceId);
    const current = this.#emergencyDrafts.get(key);
    if (current !== undefined && current.editRevision > draft.editRevision) return;
    this.#emergencyDrafts.set(key, clone(draft));
  }

  /** 永続済みDraftが救済分岐と同じ状態を包含すると証明できたときだけoverlayを破棄する。 */
  #discardCoveredEmergencyDraft(draft: ExerciseDraft): void {
    const key = draftKey(draft.courseId, draft.workspaceId);
    const emergency = this.#emergencyDrafts.get(key);
    if (emergency !== undefined && draftsHaveEquivalentRecoveryState(emergency, draft)) {
      this.#emergencyDrafts.delete(key);
    }
  }

  /** 最新durableへこのtabの分岐Draftを優先合成したExport用snapshotを返す。 */
  async emergencySnapshot(): Promise<RepositorySnapshot> {
    await this.#durableWriteTail;
    const snapshot = await this.snapshot();
    const drafts: Record<string, ExerciseDraft> = { ...snapshot.drafts };
    for (const [key, draft] of this.#emergencyDrafts) {
      // editRevisionは別tabで同じ値へ分岐し得るため、明示救済値を常に優先する。
      drafts[key] = clone(draft);
    }
    return { ...snapshot, drafts };
  }

  /** 永続lease claimを全置換と同じqueueへ並べ、永続障害だけhealthへ反映する。 */
  async tryClaimWorkspaceLease(
    candidate: Omit<WorkspaceLeaseProof, 'dataEpoch'> & { readonly dataEpoch?: number },
  ): Promise<WorkspaceLeaseClaimResult> {
    return this.#enqueueExclusive(async () => {
      if (this.#health.kind !== 'healthy') {
        throw new PersistenceUnavailableError(this.#health.cause ?? 'write');
      }
      try {
        return await this.delegate.tryClaimWorkspaceLease(candidate);
      } catch (error: unknown) {
        if (isLogicalWriteRejection(error)) throw error;
        this.#markUnavailable(classifyFailure(error, 'write'), this.#health.hasUnsavedChanges);
        throw error;
      }
    });
  }

  /** 全先行mutation後の永続workspace ownerを再読込する。 */
  async readWorkspaceLease(
    courseId: string,
    workspaceId: string,
  ): Promise<WorkspaceLeaseProof | undefined> {
    await this.#durableWriteTail;
    if (this.#health.kind !== 'healthy') {
      throw new PersistenceUnavailableError(this.#health.cause ?? 'read');
    }
    try {
      return await this.delegate.readWorkspaceLease(courseId, workspaceId);
    } catch (error: unknown) {
      this.#markUnavailable(classifyFailure(error, 'read'), this.#health.hasUnsavedChanges);
      throw error;
    }
  }

  /** 永続heartbeat CASを全置換と同じqueueへ並べる。 */
  async heartbeatWorkspaceLease(
    proof: WorkspaceLeaseProof,
    expiresAt: number,
  ): Promise<WorkspaceLeaseProof> {
    return this.#enqueueExclusive(async () => {
      try {
        return await this.delegate.heartbeatWorkspaceLease(proof, expiresAt);
      } catch (error: unknown) {
        if (isLogicalWriteRejection(error)) throw error;
        this.#markUnavailable(classifyFailure(error, 'write'), this.#health.hasUnsavedChanges);
        throw error;
      }
    });
  }

  /** 永続release CASを全置換と同じqueueへ並べる。 */
  async releaseWorkspaceLease(proof: WorkspaceLeaseProof): Promise<boolean> {
    return this.#enqueueExclusive(async () => {
      try {
        return await this.delegate.releaseWorkspaceLease(proof);
      } catch (error: unknown) {
        if (isLogicalWriteRejection(error)) throw error;
        this.#markUnavailable(classifyFailure(error, 'write'), this.#health.hasUnsavedChanges);
        throw error;
      }
    });
  }

  /** 接続を閉じ、購読可能なmemory救済状態は維持する。 */
  close(): void {
    this.delegate.close();
    this.#openPromise = undefined;
    this.#retryPromise = undefined;
  }
}
