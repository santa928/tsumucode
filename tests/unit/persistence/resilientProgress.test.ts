import { describe, expect, it, vi } from 'vitest';
import {
  PersistenceUnavailableError,
  ResilientProgressService,
} from '../../../src/core/persistence/ResilientProgressService';
import type {
  CourseProgress,
  ExerciseDraft,
  ProgressBackup,
  ProgressRepository,
  QuarantinedProgress,
  RepositorySnapshot,
  WorkspaceLeaseProof,
} from '../../../src/core/persistence/contracts';
import {
  CourseProgressVersionConflictError,
  LeaseFenceRejectedError,
} from '../../../src/core/persistence/contracts';

const EMPTY: RepositorySnapshot = {
  schemaVersion: 2,
  courses: {},
  drafts: {},
  quarantined: [],
};

/** 非同期writeの完了順をTestから制御する。 */
function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value | PromiseLike<Value>) => void;
} {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

/** Resilient test用の完全なCourse進捗を生成する。 */
function course(updatedAt = '2026-07-16T00:00:00.000Z'): CourseProgress {
  return {
    courseId: 'html-css',
    contentRevision: 'rev-1',
    lessons: {},
    currentComplete: false,
    updatedAt,
  };
}

/** Resilient test用の完全なworkspace Draftを生成する。 */
function draft(editRevision = 1): ExerciseDraft {
  return {
    courseId: 'html-css',
    lessonId: 'lesson-1',
    exerciseId: 'exercise-1',
    workspaceId: 'workspace-1',
    contentRevision: 'rev-1',
    editRevision,
    files: { 'index.html': `<main>${String(editRevision)}</main>` },
    selectedFile: 'index.html',
    cursors: { 'index.html': { anchor: 0, head: 0 } },
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {},
    updatedAt: `2026-07-16T00:00:0${String(editRevision)}.000Z`,
  };
}

/** Resilient fenced write用の完全な永続proofを返す。 */
function proof(): WorkspaceLeaseProof {
  return {
    courseId: 'html-css',
    workspaceId: 'workspace-1',
    ownerId: 'owner-a',
    token: 'token-a',
    dataEpoch: 0,
    expiresAt: 2_000,
  };
}

type FaultableMethod =
  | 'open'
  | 'getCourse'
  | 'putCourse'
  | 'putCourseVersioned'
  | 'getDraft'
  | 'putDraft'
  | 'putDraftFenced'
  | 'putDraftAndCourse'
  | 'putDraftAndCourseFenced'
  | 'snapshot'
  | 'replaceSnapshot'
  | 'replaceSnapshotWithBackup'
  | 'createBackup'
  | 'restoreBackup'
  | 'quarantine';

interface RepositoryHarness {
  readonly repository: ProgressRepository;
  readonly snapshot: ReturnType<typeof vi.fn<ProgressRepository['snapshot']>>;
  readonly replaceSnapshot: ReturnType<typeof vi.fn<ProgressRepository['replaceSnapshot']>>;
  readonly createBackup: ReturnType<typeof vi.fn<ProgressRepository['createBackup']>>;
  readonly restoreBackup: ReturnType<typeof vi.fn<ProgressRepository['restoreBackup']>>;
  readonly replaceSnapshotWithBackup: ReturnType<
    typeof vi.fn<ProgressRepository['replaceSnapshotWithBackup']>
  >;
  failNext(method: FaultableMethod, error: Error): void;
  durable(): RepositorySnapshot;
  setDurable(snapshot: RepositorySnapshot): void;
}

/** mutable durable stateと1回限りのfaultを持つRepository harnessを返す。 */
function repositoryHarness(initial: RepositorySnapshot = EMPTY): RepositoryHarness {
  let durable = structuredClone(initial);
  let courseVersion = 0;
  let backupSequence = 0;
  const backups = new Map<string, RepositorySnapshot>();
  const faults = new Map<FaultableMethod, Error[]>();
  const throwFault = (method: FaultableMethod): void => {
    const queued = faults.get(method);
    const error = queued?.shift();
    if (error !== undefined) throw error;
  };
  const replaceSnapshot = vi.fn<ProgressRepository['replaceSnapshot']>(
    async (snapshot: RepositorySnapshot) => {
      throwFault('replaceSnapshot');
      durable = structuredClone(snapshot);
    },
  );
  const createBackup = vi.fn<ProgressRepository['createBackup']>(
    async (reason: ProgressBackup['reason']) => {
      throwFault('createBackup');
      backupSequence += 1;
      const backup: ProgressBackup = {
        id: `backup-${String(backupSequence)}`,
        reason,
        createdAt: '2026-07-16T00:00:00.000Z',
        snapshot: structuredClone(durable),
      };
      backups.set(backup.id, structuredClone(durable));
      return backup;
    },
  );
  const restoreBackup = vi.fn<ProgressRepository['restoreBackup']>(async (backupId: string) => {
    throwFault('restoreBackup');
    const backup = backups.get(backupId);
    if (backup === undefined) throw new Error('backup missing');
    durable = structuredClone(backup);
  });
  const replaceSnapshotWithBackup = vi.fn<ProgressRepository['replaceSnapshotWithBackup']>(
    async (snapshot, reason) => {
      throwFault('replaceSnapshotWithBackup');
      const backup = await createBackup(reason);
      durable = structuredClone(snapshot);
      courseVersion = 0;
      return backup;
    },
  );
  const activeProof: WorkspaceLeaseProof = {
    courseId: 'html-css',
    workspaceId: 'workspace-1',
    ownerId: 'owner-a',
    token: 'token-a',
    dataEpoch: 0,
    expiresAt: 2_000,
  };
  const snapshot = vi.fn<ProgressRepository['snapshot']>(async () => {
    throwFault('snapshot');
    return structuredClone(durable);
  });
  const repository: ProgressRepository = {
    open: vi.fn(async () => {
      throwFault('open');
    }),
    getCourse: vi.fn(async (courseId: string) => {
      throwFault('getCourse');
      return structuredClone(durable.courses[courseId]);
    }),
    getCourseVersioned: vi.fn(async (courseId: string) => ({
      ...(durable.courses[courseId] === undefined
        ? {}
        : { progress: structuredClone(durable.courses[courseId]) }),
      version: courseVersion,
    })),
    putCourse: vi.fn(async (progress: CourseProgress) => {
      throwFault('putCourse');
      durable = {
        ...durable,
        courses: { ...durable.courses, [progress.courseId]: structuredClone(progress) },
      };
      courseVersion += 1;
    }),
    putCourseVersioned: vi.fn<ProgressRepository['putCourseVersioned']>(
      async (progress, expectedVersion) => {
        throwFault('putCourseVersioned');
        if (expectedVersion !== courseVersion) {
          throw new CourseProgressVersionConflictError();
        }
        durable = {
          ...durable,
          courses: { ...durable.courses, [progress.courseId]: structuredClone(progress) },
        };
        courseVersion += 1;
        return courseVersion;
      },
    ),
    getDraft: vi.fn(async (courseId: string, workspaceId: string) => {
      throwFault('getDraft');
      return structuredClone(durable.drafts[`${courseId}:${workspaceId}`]);
    }),
    putDraft: vi.fn(async (value: ExerciseDraft) => {
      throwFault('putDraft');
      durable = {
        ...durable,
        drafts: {
          ...durable.drafts,
          [`${value.courseId}:${value.workspaceId}`]: structuredClone(value),
        },
      };
    }),
    putDraftFenced: vi.fn(async (value: ExerciseDraft) => {
      throwFault('putDraftFenced');
      durable = {
        ...durable,
        drafts: {
          ...durable.drafts,
          [`${value.courseId}:${value.workspaceId}`]: structuredClone(value),
        },
      };
    }),
    putDraftAndCourse: vi.fn(async (value: ExerciseDraft, progress: CourseProgress) => {
      throwFault('putDraftAndCourse');
      durable = {
        ...durable,
        courses: { ...durable.courses, [progress.courseId]: structuredClone(progress) },
        drafts: {
          ...durable.drafts,
          [`${value.courseId}:${value.workspaceId}`]: structuredClone(value),
        },
      };
      courseVersion += 1;
    }),
    putDraftAndCourseFenced: vi.fn<ProgressRepository['putDraftAndCourseFenced']>(
      async (value, progress, _proof, expectedVersion) => {
        throwFault('putDraftAndCourseFenced');
        if (expectedVersion !== courseVersion) throw new Error('course version conflict');
        durable = {
          ...durable,
          courses: { ...durable.courses, [progress.courseId]: structuredClone(progress) },
          drafts: {
            ...durable.drafts,
            [`${value.courseId}:${value.workspaceId}`]: structuredClone(value),
          },
        };
        courseVersion += 1;
        return courseVersion;
      },
    ),
    snapshot,
    replaceSnapshot,
    replaceSnapshotWithBackup,
    createBackup,
    restoreBackup,
    quarantine: vi.fn(async (record: QuarantinedProgress) => {
      throwFault('quarantine');
      durable = { ...durable, quarantined: [...durable.quarantined, structuredClone(record)] };
    }),
    tryClaimWorkspaceLease: vi.fn(async () => ({ acquired: true, proof: activeProof })),
    readWorkspaceLease: vi.fn(async () => activeProof),
    heartbeatWorkspaceLease: vi.fn<ProgressRepository['heartbeatWorkspaceLease']>(
      async (_proof, expiresAt) => ({ ...activeProof, expiresAt }),
    ),
    releaseWorkspaceLease: vi.fn(async () => true),
    close: vi.fn(),
  };
  return {
    repository,
    snapshot,
    replaceSnapshot,
    createBackup,
    restoreBackup,
    replaceSnapshotWithBackup,
    failNext(method, error) {
      faults.set(method, [...(faults.get(method) ?? []), error]);
    },
    durable: () => structuredClone(durable),
    setDurable(snapshot) {
      durable = structuredClone(snapshot);
    },
  };
}

describe('ResilientProgressService', () => {
  it('open成功時にdurable snapshotをbaselineとmemoryへ読み込みhealthyになる', async () => {
    const initial = { ...EMPTY, courses: { 'html-css': course() } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);

    expect(service.getHealthSnapshot()).toEqual({
      kind: 'initializing',
      hasUnsavedChanges: false,
    });

    await service.open();

    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'healthy',
      hasUnsavedChanges: false,
    });
    await expect(service.getCourse('html-css')).resolves.toEqual(course());
    await expect(service.emergencySnapshot()).resolves.toEqual(initial);
  });

  it('initial open失敗をmemory-onlyへ変換し、readyをrejectせず空memoryで継続する', async () => {
    const harness = repositoryHarness();
    harness.failNext('open', new DOMException('blocked', 'SecurityError'));
    const service = new ResilientProgressService(harness.repository);

    await expect(service.open()).resolves.toBeUndefined();

    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      cause: 'open',
    });
    await expect(service.getDraft('html-css', 'workspace-1')).resolves.toBeUndefined();
  });

  it('initial open失敗後のDraftとCourseを空durableへのretryで同時に永続化する', async () => {
    const harness = repositoryHarness();
    harness.failNext('open', new DOMException('blocked', 'SecurityError'));
    const service = new ResilientProgressService(harness.repository);
    const rescuedDraft = draft(6);
    const rescuedCourse = course('2026-07-16T00:00:06.000Z');
    await service.open();

    await expect(service.putDraftAndCourse(rescuedDraft, rescuedCourse)).rejects.toBeInstanceOf(
      PersistenceUnavailableError,
    );
    expect(harness.durable()).toEqual(EMPTY);

    await expect(service.retry()).resolves.toEqual({ kind: 'recovered' });

    expect(harness.createBackup).toHaveBeenCalledWith('recovery');
    expect(harness.durable()).toEqual({
      ...EMPTY,
      courses: { 'html-css': rescuedCourse },
      drafts: { 'html-css:workspace-1': rescuedDraft },
    });
    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'healthy',
      hasUnsavedChanges: false,
    });
  });

  it('open後の初期snapshot失敗をread障害として分類する', async () => {
    const harness = repositoryHarness();
    harness.failNext('snapshot', new Error('read failed'));
    const service = new ResilientProgressService(harness.repository);

    await service.open();

    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      cause: 'read',
    });
  });

  it('原子的write失敗でもDraftとCourseの最新値をmemoryへ同時保持して元Errorを返す', async () => {
    const harness = repositoryHarness();
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    const quota = new DOMException('full', 'QuotaExceededError');
    harness.failNext('putDraftAndCourse', quota);

    await expect(
      service.putDraftAndCourse(draft(2), course('2026-07-16T00:00:02.000Z')),
    ).rejects.toBe(quota);

    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      cause: 'quota',
      hasUnsavedChanges: true,
    });
    const rescue = await service.emergencySnapshot();
    expect(rescue.drafts['html-css:workspace-1']?.editRevision).toBe(2);
    expect(rescue.courses['html-css']?.updatedAt).toBe('2026-07-16T00:00:02.000Z');
    await expect(service.getDraft('html-css', 'workspace-1')).resolves.toMatchObject({
      editRevision: 2,
    });
  });

  it('read失敗時はcached memoryへfallbackしhealthだけをdegradeする', async () => {
    const initial = { ...EMPTY, drafts: { 'html-css:workspace-1': draft(1) } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    harness.failNext('getDraft', new Error('read failed'));

    await expect(service.getDraft('html-css', 'workspace-1')).resolves.toEqual(draft(1));
    expect(service.getHealthSnapshot()).toMatchObject({ kind: 'memory-only', cause: 'read' });
  });

  it('durableがbaselineのままならretryでmemoryをbackup-first反映する', async () => {
    const initial = { ...EMPTY, courses: { 'html-css': course() } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    harness.failNext('putDraft', new Error('write failed'));
    await expect(service.putDraft(draft(2))).rejects.toThrow('write failed');

    await expect(service.retry()).resolves.toEqual({ kind: 'recovered' });

    expect(harness.createBackup).toHaveBeenCalledWith('recovery');
    const recoveryCall = harness.replaceSnapshotWithBackup.mock.calls[0];
    expect(recoveryCall?.[0].drafts['html-css:workspace-1']).toEqual(draft(2));
    expect(recoveryCall?.[1]).toBe('recovery');
    expect(harness.durable().drafts['html-css:workspace-1']?.editRevision).toBe(2);
    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'healthy',
      hasUnsavedChanges: false,
    });
  });

  it('unsaved開始のretry中snapshot待機中に更新したDraftをmemoryとdurableの両方へ反映する', async () => {
    const initial = { ...EMPTY, drafts: { 'html-css:workspace-1': draft(1) } };
    const harness = repositoryHarness(initial);
    const retrySnapshot = deferred<RepositorySnapshot>();
    let snapshotCalls = 0;
    const snapshot = vi.fn<ProgressRepository['snapshot']>(async () => {
      snapshotCalls += 1;
      if (snapshotCalls === 1) return harness.repository.snapshot();
      if (snapshotCalls === 2) return retrySnapshot.promise;
      return harness.repository.snapshot();
    });
    const service = new ResilientProgressService({ ...harness.repository, snapshot });
    await service.open();
    harness.failNext('putDraft', new Error('write failed'));
    await expect(service.putDraft(draft(2))).rejects.toThrow('write failed');

    const recovery = service.retry();
    await vi.waitFor(() => {
      expect(snapshot).toHaveBeenCalledTimes(2);
    });
    await expect(service.putDraft(draft(3))).rejects.toBeInstanceOf(PersistenceUnavailableError);
    retrySnapshot.resolve(initial);

    await expect(recovery).resolves.toEqual({ kind: 'recovered' });
    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']?.editRevision).toBe(
      3,
    );
    expect(harness.durable().drafts['html-css:workspace-1']?.editRevision).toBe(3);
    expect(service.getHealthSnapshot()).toEqual({
      kind: 'healthy',
      hasUnsavedChanges: false,
    });
  });

  it('unsavedなし開始のretry中snapshot待機中に更新したDraftで古いdurableを採用しない', async () => {
    const initial = { ...EMPTY, drafts: { 'html-css:workspace-1': draft(1) } };
    const harness = repositoryHarness(initial);
    const retrySnapshot = deferred<RepositorySnapshot>();
    let snapshotCalls = 0;
    const snapshot = vi.fn<ProgressRepository['snapshot']>(async () => {
      snapshotCalls += 1;
      if (snapshotCalls <= 2) return harness.repository.snapshot();
      if (snapshotCalls === 3) return retrySnapshot.promise;
      return harness.repository.snapshot();
    });
    const service = new ResilientProgressService({ ...harness.repository, snapshot });
    await service.open();
    harness.failNext('snapshot', new Error('read failed'));
    await expect(service.snapshot()).resolves.toEqual(initial);
    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      cause: 'read',
      hasUnsavedChanges: false,
    });

    const recovery = service.retry();
    await vi.waitFor(() => {
      expect(snapshot).toHaveBeenCalledTimes(3);
    });
    await expect(service.putDraft(draft(4))).rejects.toBeInstanceOf(PersistenceUnavailableError);
    retrySnapshot.resolve(initial);

    await expect(recovery).resolves.toEqual({ kind: 'recovered' });
    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']?.editRevision).toBe(
      4,
    );
    expect(harness.durable().drafts['html-css:workspace-1']?.editRevision).toBe(4);
  });

  it('durableがbaselineから変わったretryは自動上書きせずconflictにする', async () => {
    const initial = { ...EMPTY, courses: { 'html-css': course() } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    harness.failNext('putDraft', new Error('write failed'));
    await expect(service.putDraft(draft(2))).rejects.toThrow();
    harness.setDurable({
      ...initial,
      courses: { 'html-css': course('2026-07-16T00:00:09.000Z') },
    });

    await expect(service.retry()).resolves.toEqual({ kind: 'conflict' });

    expect(service.getHealthSnapshot()).toMatchObject({ kind: 'conflict' });
    expect(harness.replaceSnapshot).not.toHaveBeenCalled();
    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']).toBeDefined();
  });

  it('initial openでbaseline不明かつdurable recordが現れた場合もconflictにする', async () => {
    const harness = repositoryHarness();
    harness.failNext('open', new Error('blocked'));
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    await expect(service.putDraft(draft(1))).rejects.toBeInstanceOf(PersistenceUnavailableError);
    harness.setDurable({ ...EMPTY, courses: { 'html-css': course() } });

    await expect(service.retry()).resolves.toEqual({ kind: 'conflict' });
    expect(harness.replaceSnapshot).not.toHaveBeenCalled();
  });

  it('conflictは端末側維持または救済memory反映を明示するまで両方を保持する', async () => {
    const initial = { ...EMPTY, courses: { 'html-css': course() } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    harness.failNext('putDraft', new Error('write failed'));
    await expect(service.putDraft(draft(3))).rejects.toThrow();
    const device = {
      ...initial,
      courses: { 'html-css': course('2026-07-16T00:00:10.000Z') },
    };
    harness.setDurable(device);
    await service.retry();

    await service.resolveConflict('keep-device');
    expect(await service.emergencySnapshot()).toEqual(device);
    expect(service.getHealthSnapshot().kind).toBe('healthy');

    harness.failNext('putDraft', new Error('write failed again'));
    await expect(service.putDraft(draft(4))).rejects.toThrow();
    harness.setDurable({
      ...device,
      courses: { 'html-css': course('2026-07-16T00:00:11.000Z') },
    });
    await service.retry();
    await service.resolveConflict('use-memory');
    expect(harness.durable().drafts['html-css:workspace-1']?.editRevision).toBe(4);
    expect(service.getHealthSnapshot().kind).toBe('healthy');
  });

  it('use-memoryのconflict解決中に更新したDraftを古いmemoryで上書きしない', async () => {
    const initial = { ...EMPTY, courses: { 'html-css': course() } };
    const harness = repositoryHarness(initial);
    const firstReplace = deferred<undefined>();
    let replaceCalls = 0;
    const replaceSnapshotWithBackup = vi.fn<ProgressRepository['replaceSnapshotWithBackup']>(
      async (snapshot, reason) => {
        replaceCalls += 1;
        if (replaceCalls === 1) await firstReplace.promise;
        return harness.repository.replaceSnapshotWithBackup(snapshot, reason);
      },
    );
    const service = new ResilientProgressService({
      ...harness.repository,
      replaceSnapshotWithBackup,
    });
    await service.open();
    harness.failNext('putDraft', new Error('write failed'));
    await expect(service.putDraft(draft(2))).rejects.toThrow('write failed');
    harness.setDurable({
      ...initial,
      courses: { 'html-css': course('2026-07-16T00:00:10.000Z') },
    });
    await expect(service.retry()).resolves.toEqual({ kind: 'conflict' });

    const resolution = service.resolveConflict('use-memory');
    await vi.waitFor(() => {
      expect(replaceSnapshotWithBackup).toHaveBeenCalledOnce();
    });
    await expect(service.putDraft(draft(5))).rejects.toBeInstanceOf(PersistenceUnavailableError);
    firstReplace.resolve(undefined);

    await expect(resolution).resolves.toBeUndefined();
    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']?.editRevision).toBe(
      5,
    );
    expect(harness.durable().drafts['html-css:workspace-1']?.editRevision).toBe(5);
    expect(replaceSnapshotWithBackup).toHaveBeenCalledTimes(2);
  });

  it('atomic recovery失敗時は部分置換せずmemory救済を失わない', async () => {
    const harness = repositoryHarness();
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    harness.failNext('putDraft', new Error('write failed'));
    await expect(service.putDraft(draft(5))).rejects.toThrow();
    harness.failNext('replaceSnapshotWithBackup', new Error('replace failed'));

    await expect(service.retry()).rejects.toThrow('replace failed');

    expect(harness.restoreBackup).not.toHaveBeenCalled();
    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']?.editRevision).toBe(
      5,
    );
    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      hasUnsavedChanges: true,
    });
  });

  it('Import相当のreplace失敗ではincomingをmemory救済へ混ぜない', async () => {
    const initial = { ...EMPTY, courses: { 'html-css': course() } };
    const incoming = { ...EMPTY, drafts: { 'html-css:workspace-1': draft(9) } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    harness.failNext('replaceSnapshot', new Error('transaction abort'));

    await expect(service.replaceSnapshot(incoming)).rejects.toThrow('transaction abort');

    expect(await service.emergencySnapshot()).toEqual(initial);
    expect(service.getHealthSnapshot()).toMatchObject({ kind: 'memory-only' });
  });

  it('healthとdata revisionを参照安定snapshotで購読し、返却値を外部変更させない', async () => {
    const harness = repositoryHarness();
    const service = new ResilientProgressService(harness.repository);
    const healthListener = vi.fn();
    const dataListener = vi.fn();
    const unsubscribeHealth = service.subscribeHealth(healthListener);
    const unsubscribeData = service.subscribeData(dataListener);
    await service.open();
    const before = service.getHealthSnapshot();
    await service.putCourse(course());
    const exported = await service.emergencySnapshot();
    (exported.courses as Record<string, CourseProgress>)['html-css'] = course('changed');

    expect(service.getHealthSnapshot()).toBe(before);
    expect((await service.getCourse('html-css'))?.updatedAt).toBe('2026-07-16T00:00:00.000Z');
    expect(dataListener).toHaveBeenCalled();
    unsubscribeHealth();
    unsubscribeData();
  });

  it('値が変わらないreadではdata revisionを進めず購読Hookの再読込loopを起こさない', async () => {
    const harness = repositoryHarness();
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    const dataListener = vi.fn();
    service.subscribeData(dataListener);
    const before = service.getDataRevision();

    await service.getCourse('html-css');
    await service.getCourse('html-css');
    await service.getDraft('html-css', 'workspace-1');

    expect(service.getDataRevision()).toBe(before);
    expect(dataListener).not.toHaveBeenCalled();
  });

  it('並行writeを呼出順に直列化し、後続失敗後に先行成功がhealthを誤回復させない', async () => {
    const harness = repositoryHarness();
    const firstWrite = deferred<undefined>();
    const putDraft = vi.fn<ProgressRepository['putDraft']>(async (value) => {
      if (value.editRevision === 1) {
        await firstWrite.promise;
        await harness.repository.putDraft(value);
        return;
      }
      throw new Error('second write failed');
    });
    const service = new ResilientProgressService({ ...harness.repository, putDraft });
    await service.open();

    const first = service.putDraft(draft(1));
    await vi.waitFor(() => {
      expect(putDraft).toHaveBeenCalledTimes(1);
    });
    const second = service.putDraft(draft(2));
    expect(putDraft).toHaveBeenCalledTimes(1);
    firstWrite.resolve(undefined);

    await expect(first).resolves.toBeUndefined();
    await expect(second).rejects.toThrow('second write failed');
    expect(putDraft).toHaveBeenCalledTimes(2);
    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      hasUnsavedChanges: true,
    });
    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']?.editRevision).toBe(
      2,
    );
  });

  it('fence拒否をmemory救済・health degraded・retry対象へ混入しない', async () => {
    const initial = { ...EMPTY, drafts: { 'html-css:workspace-1': draft(1) } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    const healthBefore = service.getHealthSnapshot();
    harness.failNext('putDraftFenced', new LeaseFenceRejectedError());

    await expect(service.putDraftFenced(draft(2), proof())).rejects.toBeInstanceOf(
      LeaseFenceRejectedError,
    );

    expect(await service.emergencySnapshot()).toEqual(initial);
    expect(service.getHealthSnapshot()).toBe(healthBefore);
  });

  it('失効fenceの最新Draftを正本memoryと分離した緊急Export専用overlayへ保持する', async () => {
    const initial = { ...EMPTY, drafts: { 'html-css:workspace-1': draft(1) } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();

    service.retainEmergencyDraft(draft(2));

    await expect(service.getDraft('html-css', 'workspace-1')).resolves.toEqual(draft(1));
    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']).toEqual(draft(2));
    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'healthy',
      hasUnsavedChanges: false,
    });
  });

  it('別tabの同revision更新後も最新durable全体へこのtabの緊急Draftを重ねてExportする', async () => {
    const initial = { ...EMPTY, drafts: { 'html-css:workspace-1': draft(5) } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    const emergency = {
      ...draft(6),
      files: { 'index.html': '<main>old-tab emergency</main>' },
    };
    service.retainEmergencyDraft(emergency);
    const otherTab = {
      ...draft(6),
      files: { 'index.html': '<main>new-tab canonical</main>' },
    };
    harness.setDurable({
      ...EMPTY,
      courses: { 'html-css': course('2026-07-16T00:00:06.000Z') },
      drafts: { 'html-css:workspace-1': otherTab },
    });

    const exported = await service.emergencySnapshot();

    expect(harness.snapshot).toHaveBeenCalledTimes(2);
    expect(exported.courses['html-css']).toEqual(course('2026-07-16T00:00:06.000Z'));
    expect(exported.drafts['html-css:workspace-1']).toEqual(emergency);
  });

  it('revisionが大きいだけの別分岐保存ではこのtabの緊急Draftを破棄しない', async () => {
    const initial = { ...EMPTY, drafts: { 'html-css:workspace-1': draft(5) } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    const emergency = {
      ...draft(6),
      files: { 'index.html': '<main>emergency branch</main>' },
    };
    service.retainEmergencyDraft(emergency);

    await service.putDraftFenced(
      {
        ...draft(7),
        files: { 'index.html': '<main>different canonical branch</main>' },
      },
      proof(),
    );

    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']).toEqual(emergency);
  });

  it('緊急Draftと同じ救済内容を永続保存できた場合だけoverlayを破棄する', async () => {
    const harness = repositoryHarness();
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    const emergency = {
      ...draft(6),
      files: { 'index.html': '<main>recovered branch</main>' },
    };
    service.retainEmergencyDraft(emergency);
    await service.putDraftFenced(
      {
        ...emergency,
        editRevision: 7,
        updatedAt: '2026-07-16T00:00:07.000Z',
      },
      proof(),
    );
    const laterCanonical = {
      ...draft(8),
      files: { 'index.html': '<main>later canonical</main>' },
    };
    harness.setDurable({
      ...EMPTY,
      drafts: { 'html-css:workspace-1': laterCanonical },
    });

    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']).toEqual(
      laterCanonical,
    );
  });

  it('Course version競合をmemory救済・health degradedへ混入しない', async () => {
    const initial = { ...EMPTY, courses: { 'html-css': course() } };
    const harness = repositoryHarness(initial);
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    const healthBefore = service.getHealthSnapshot();
    harness.failNext('putCourseVersioned', new CourseProgressVersionConflictError());
    const incoming = course('2026-07-16T00:00:02.000Z');

    await expect(service.putCourseVersioned(incoming, 0)).rejects.toBeInstanceOf(
      CourseProgressVersionConflictError,
    );

    expect(await service.emergencySnapshot()).toEqual(initial);
    expect(service.getHealthSnapshot()).toBe(healthBefore);
  });

  it('fenced writeのquota失敗は従来どおり最新Draftをmemory救済する', async () => {
    const harness = repositoryHarness();
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    harness.failNext('putDraftFenced', new DOMException('quota', 'QuotaExceededError'));

    await expect(service.putDraftFenced(draft(2), proof())).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });

    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']).toEqual(draft(2));
    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      cause: 'quota',
      hasUnsavedChanges: true,
    });
  });

  it('初回quota後の2回目fenced Draftも最新memoryへ救済してrejectする', async () => {
    const harness = repositoryHarness();
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    harness.failNext('putDraftFenced', new DOMException('quota', 'QuotaExceededError'));
    await expect(service.putDraftFenced(draft(1), proof())).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });

    await expect(service.putDraftFenced(draft(2), proof())).rejects.toBeInstanceOf(
      PersistenceUnavailableError,
    );

    expect((await service.emergencySnapshot()).drafts['html-css:workspace-1']).toEqual(draft(2));
    expect(service.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      hasUnsavedChanges: true,
    });
  });

  it('初回quota後の2回目fenced Draft+Courseも両方を最新memoryへ救済してrejectする', async () => {
    const harness = repositoryHarness();
    const service = new ResilientProgressService(harness.repository);
    await service.open();
    harness.failNext('putDraftAndCourseFenced', new DOMException('quota', 'QuotaExceededError'));
    await expect(
      service.putDraftAndCourseFenced(draft(1), course(), proof(), 0),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });
    const latestCourse = course('2026-07-16T00:00:02.000Z');

    await expect(
      service.putDraftAndCourseFenced(draft(2), latestCourse, proof(), 0),
    ).rejects.toBeInstanceOf(PersistenceUnavailableError);

    const rescued = await service.emergencySnapshot();
    expect(rescued.drafts['html-css:workspace-1']).toEqual(draft(2));
    expect(rescued.courses['html-css']).toEqual(latestCourse);
  });

  it('atomic全置換を通常writeと同じexclusive queueへ置き途中autosaveを開始させない', async () => {
    const harness = repositoryHarness();
    const replacement = { ...EMPTY, courses: { 'html-css': course() } };
    const gate = deferred<undefined>();
    const events: string[] = [];
    const replaceSnapshotWithBackup = vi.fn<ProgressRepository['replaceSnapshotWithBackup']>(
      async (_snapshot, reason) => {
        events.push('replace:start');
        await gate.promise;
        events.push('replace:end');
        return {
          id: 'backup-exclusive',
          reason,
          createdAt: '2026-07-16T00:00:00.000Z',
          snapshot: EMPTY,
        };
      },
    );
    const putDraftFenced = vi.fn<ProgressRepository['putDraftFenced']>(async () => {
      events.push('draft:start');
    });
    const service = new ResilientProgressService({
      ...harness.repository,
      replaceSnapshotWithBackup,
      putDraftFenced,
    });
    await service.open();

    const replacing = service.replaceSnapshotWithBackup(replacement, 'before-import');
    await vi.waitFor(() => {
      expect(events).toEqual(['replace:start']);
    });
    const saving = service.putDraftFenced(draft(2), proof());
    await Promise.resolve();
    expect(events).toEqual(['replace:start']);
    gate.resolve(undefined);

    await expect(replacing).resolves.toMatchObject({ id: 'backup-exclusive' });
    await expect(saving).resolves.toBeUndefined();
    expect(events).toEqual(['replace:start', 'replace:end', 'draft:start']);
  });

  it('Course version readは先行durable mutationを待ち、偽のversion 0でCASを開始しない', async () => {
    const harness = repositoryHarness({ ...EMPTY, courses: { 'html-css': course() } });
    const gate = deferred<undefined>();
    const replaceSnapshotWithBackup = vi.fn<ProgressRepository['replaceSnapshotWithBackup']>(
      async (_snapshot, reason) => {
        await gate.promise;
        return {
          id: 'backup-version-read',
          reason,
          createdAt: '2026-07-16T00:00:00.000Z',
          snapshot: EMPTY,
        };
      },
    );
    const getCourseVersioned = vi.fn<ProgressRepository['getCourseVersioned']>(async () => ({
      progress: course(),
      version: 7,
    }));
    const service = new ResilientProgressService({
      ...harness.repository,
      replaceSnapshotWithBackup,
      getCourseVersioned,
    });
    await service.open();
    const replacing = service.replaceSnapshotWithBackup(EMPTY, 'before-import');
    const reading = service.getCourseVersioned('html-css');
    let settled = false;
    void reading.finally(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(getCourseVersioned).not.toHaveBeenCalled();
    gate.resolve(undefined);

    await expect(replacing).resolves.toMatchObject({ id: 'backup-version-read' });
    await expect(reading).resolves.toMatchObject({ version: 7 });
    expect(getCourseVersioned).toHaveBeenCalledOnce();
  });

  it('backup復元をexclusive queueへ置き途中autosaveを開始させない', async () => {
    const harness = repositoryHarness();
    const restored = { ...EMPTY, courses: { 'html-css': course() } };
    const gate = deferred<undefined>();
    const events: string[] = [];
    let restoreFinished = false;
    const restoreBackup = vi.fn<ProgressRepository['restoreBackup']>(async () => {
      events.push('restore:start');
      await gate.promise;
      restoreFinished = true;
      events.push('restore:end');
    });
    const snapshot = vi.fn<ProgressRepository['snapshot']>(async () =>
      restoreFinished ? restored : EMPTY,
    );
    const putDraftFenced = vi.fn<ProgressRepository['putDraftFenced']>(async () => {
      events.push('draft:start');
    });
    const service = new ResilientProgressService({
      ...harness.repository,
      restoreBackup,
      snapshot,
      putDraftFenced,
    });
    await service.open();

    const restoring = service.restoreBackup('backup-exclusive');
    await vi.waitFor(() => {
      expect(events).toEqual(['restore:start']);
    });
    const saving = service.putDraftFenced(draft(2), proof());
    await Promise.resolve();
    expect(events).toEqual(['restore:start']);
    gate.resolve(undefined);

    await expect(restoring).resolves.toBeUndefined();
    await expect(saving).resolves.toBeUndefined();
    expect(events).toEqual(['restore:start', 'restore:end', 'draft:start']);
  });
});
