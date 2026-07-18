import type { IDBPDatabase } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbProgressRepository } from '../../../src/adapters/persistence/indexeddb/IndexedDbProgressRepository';
import type { ProgressDatabase } from '../../../src/adapters/persistence/indexeddb/openProgressDatabase';
import type {
  CourseProgress,
  ExerciseDraft,
  QuarantinedProgress,
  RepositorySnapshot,
} from '../../../src/core/persistence/contracts';
import { schemaV1Progress } from '../../fixtures/progress/schema-v1';

type StoreName = 'courses' | 'drafts' | 'backups' | 'quarantine' | 'metadata';

interface TransactionRecord {
  readonly stores: readonly StoreName[];
  readonly mode: 'readonly' | 'readwrite';
  doneObserved: boolean;
}

interface FakeDatabase {
  readonly database: IDBPDatabase<ProgressDatabase>;
  readonly stores: Readonly<Record<StoreName, Map<string, unknown>>>;
  readonly transactions: TransactionRecord[];
  readonly close: ReturnType<typeof vi.fn>;
  readonly failNextTransactionalPut: (store: StoreName) => void;
}

/** RepositoryのIndexedDB request順とtransaction境界をmemory Mapで観測する。 */
function createFakeDatabase(
  seed: Partial<Record<StoreName, readonly unknown[]>> = {},
): FakeDatabase {
  const stores: Record<StoreName, Map<string, unknown>> = {
    courses: new Map(),
    drafts: new Map(),
    backups: new Map(),
    quarantine: new Map(),
    metadata: new Map(),
  };
  const transactions: TransactionRecord[] = [];
  const close = vi.fn();
  let failingPutStore: StoreName | undefined;

  /** Object storeごとのkeyPathをtest fixtureへ適用する。 */
  const keyFor = (store: StoreName, value: unknown): string => {
    if (typeof value !== 'object' || value === null) throw new Error('record expected');
    const record = value as Record<string, unknown>;
    const field =
      store === 'drafts' || store === 'metadata' ? 'key' : store === 'courses' ? 'courseId' : 'id';
    const key = record[field];
    if (typeof key !== 'string') throw new Error(`${field} expected`);
    return key;
  };

  for (const [store, records] of Object.entries(seed) as [StoreName, readonly unknown[]][]) {
    for (const record of records) stores[store].set(keyFor(store, record), structuredClone(record));
  }

  /** 指定Map集合だけを操作し、必要なら次のtransactional putを失敗させる。 */
  const objectStore = (
    target: Record<StoreName, Map<string, unknown>>,
    store: StoreName,
    transactional: boolean,
  ) => ({
    get: async (key: string) => structuredClone(target[store].get(key)),
    getAll: async () => structuredClone([...target[store].values()]),
    put: async (value: unknown) => {
      if (transactional && failingPutStore === store) {
        failingPutStore = undefined;
        throw new Error(`transactional put failed: ${store}`);
      }
      const key = keyFor(store, value);
      target[store].set(key, structuredClone(value));
      return key;
    },
    clear: async () => {
      target[store].clear();
    },
    delete: async (key: string) => {
      target[store].delete(key);
    },
  });

  const database = {
    get: async (store: StoreName, key: string) => objectStore(stores, store, false).get(key),
    getAll: async (store: StoreName) => objectStore(stores, store, false).getAll(),
    put: async (store: StoreName, value: unknown) => objectStore(stores, store, false).put(value),
    transaction: (storeNames: StoreName | readonly StoreName[], mode: 'readonly' | 'readwrite') => {
      const selected = typeof storeNames === 'string' ? [storeNames] : [...storeNames];
      const record: TransactionRecord = { stores: selected, mode, doneObserved: false };
      transactions.push(record);
      const staged: Record<StoreName, Map<string, unknown>> = {
        courses: new Map(stores.courses),
        drafts: new Map(stores.drafts),
        backups: new Map(stores.backups),
        quarantine: new Map(stores.quarantine),
        metadata: new Map(stores.metadata),
      };
      return {
        objectStore: (store: StoreName) =>
          objectStore(mode === 'readwrite' ? staged : stores, store, mode === 'readwrite'),
        get done() {
          record.doneObserved = true;
          const plannedFailure =
            mode === 'readwrite' &&
            failingPutStore !== undefined &&
            selected.includes(failingPutStore)
              ? failingPutStore
              : undefined;
          return new Promise<void>((resolve, reject) => {
            setTimeout(() => {
              if (plannedFailure !== undefined) {
                reject(new Error(`transaction aborted: ${plannedFailure}`));
                return;
              }
              if (mode === 'readwrite') {
                for (const store of selected) {
                  stores[store] = new Map(staged[store]);
                }
              }
              resolve();
            }, 0);
          });
        },
      };
    },
    close,
  } as unknown as IDBPDatabase<ProgressDatabase>;

  return {
    database,
    stores,
    transactions,
    close,
    failNextTransactionalPut(store) {
      failingPutStore = store;
    },
  };
}

/** Repository operation用の完全なCourseProgressを生成する。 */
function course(updatedAt = '2026-07-10T00:00:00.000Z'): CourseProgress {
  return {
    courseId: 'fixture',
    contentRevision: 'rev-2',
    lessons: {},
    currentComplete: false,
    updatedAt,
  };
}

/** Repository operation用の完全なExerciseDraftを生成する。 */
function draft(editRevision = 1, workspaceId = 'workspace-1'): ExerciseDraft {
  return {
    courseId: 'fixture',
    lessonId: 'lesson-1',
    exerciseId: 'ex-1',
    workspaceId,
    contentRevision: 'rev-2',
    editRevision,
    files: { 'index.html': '<main />' },
    selectedFile: 'index.html',
    cursors: { 'index.html': { anchor: 1, head: 1 } },
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {},
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
}

/** Durable fencing testで用いる完全なworkspace lease proofを返す。 */
function leaseProof(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    courseId: 'fixture',
    workspaceId: 'workspace-1',
    ownerId: 'owner-a',
    token: 'token-a',
    dataEpoch: 0,
    expiresAt: 2_000,
    ...overrides,
  };
}

describe('IndexedDbProgressRepository', () => {
  it('空DBをschema v2で初期化し、未openとclose後の操作を拒否する', async () => {
    const fake = createFakeDatabase();
    const openDatabase = vi.fn().mockResolvedValue(fake.database);
    const repository = new IndexedDbProgressRepository('test', openDatabase);

    await expect(repository.getCourse('fixture')).rejects.toThrow('ProgressRepository is not open');
    await repository.open();
    expect(openDatabase).toHaveBeenCalledWith('test');
    expect(fake.stores.metadata.get('recordSchemaVersion')).toEqual({
      key: 'recordSchemaVersion',
      kind: 'record-schema-version',
      value: 2,
    });
    expect(await repository.snapshot()).toEqual({
      schemaVersion: 2,
      courses: {},
      drafts: {},
      quarantined: [],
    });

    repository.close();
    expect(fake.close).toHaveBeenCalledTimes(1);
    await expect(repository.getCourse('fixture')).rejects.toThrow('ProgressRepository is not open');
  });

  it('metadataなしのv1 recordをopen時に移行する', async () => {
    const v1Course = schemaV1Progress.courses.fixture;
    const v1Draft = {
      ...schemaV1Progress.drafts['fixture:workspace-1'],
      key: 'fixture:workspace-1',
    };
    const fake = createFakeDatabase({ courses: [v1Course], drafts: [v1Draft] });
    const repository = new IndexedDbProgressRepository('test', async () => fake.database);

    await repository.open();
    expect((await repository.getDraft('fixture', 'workspace-1'))?.editRevision).toBe(0);
    expect(fake.stores.metadata.get('recordSchemaVersion')).toMatchObject({ value: 2 });
  });

  it('全Repository操作をkeyとtransaction境界を保って実行する', async () => {
    const fake = createFakeDatabase();
    const repository = new IndexedDbProgressRepository('test', async () => fake.database);
    await repository.open();
    const progress = course();
    const exerciseDraft = draft();

    await repository.putCourse(progress);
    await repository.putDraft(exerciseDraft);
    expect(await repository.getCourse('fixture')).toEqual(progress);
    expect(await repository.getDraft('fixture', 'workspace-1')).toEqual(exerciseDraft);
    expect(fake.stores.drafts.get('fixture:workspace-1')).toMatchObject({
      key: 'fixture:workspace-1',
      editRevision: 1,
    });

    await repository.putDraftAndCourse(draft(2), course('2026-07-10T00:00:02.000Z'));
    expect(fake.transactions).toContainEqual({
      stores: ['drafts', 'courses', 'metadata'],
      mode: 'readwrite',
      doneObserved: true,
    });
    await expect(
      repository.putDraftAndCourse(draft(3), { ...course(), courseId: 'other' }),
    ).rejects.toThrow('DraftとCourseProgressのcourseIdが一致しません');

    const quarantine: QuarantinedProgress = {
      id: 'q-1',
      reason: 'broken',
      quarantinedAt: '2026-07-10T00:00:00.000Z',
      raw: 42,
    };
    await repository.quarantine(quarantine);
    const snapshot = await repository.snapshot();
    expect(snapshot.quarantined).toEqual([quarantine]);
    expect(fake.transactions).toContainEqual({
      stores: ['courses', 'drafts', 'quarantine'],
      mode: 'readonly',
      doneObserved: true,
    });

    const replacement: RepositorySnapshot = {
      schemaVersion: 2,
      courses: { replacement: { ...progress, courseId: 'replacement' } },
      drafts: {},
      quarantined: [],
    };
    await repository.replaceSnapshot(replacement);
    expect(await repository.snapshot()).toEqual(replacement);
    expect(fake.transactions).toContainEqual({
      stores: ['courses', 'drafts', 'quarantine', 'metadata'],
      mode: 'readwrite',
      doneObserved: true,
    });
    await expect(
      repository.replaceSnapshot({
        ...replacement,
        courses: { wrong: { ...progress, courseId: 'right' } },
      }),
    ).rejects.toThrow('CourseProgress keyがrecord IDと一致しません: wrong');
    await expect(
      repository.replaceSnapshot({
        ...replacement,
        drafts: { wrong: exerciseDraft },
      }),
    ).rejects.toThrow('ExerciseDraft keyがrecord IDと一致しません: wrong');

    const backup = await repository.createBackup('manual');
    await repository.replaceSnapshot({
      schemaVersion: 2,
      courses: {},
      drafts: {},
      quarantined: [],
    });
    const staleBeforeRestore = await repository.getCourseVersioned('replacement');
    await repository.restoreBackup(backup.id);
    expect(await repository.snapshot()).toEqual(backup.snapshot);
    await expect(
      repository.putCourseVersioned(
        { ...progress, courseId: 'replacement' },
        staleBeforeRestore.version,
      ),
    ).rejects.toMatchObject({ name: 'CourseProgressVersionConflictError' });
    await expect(repository.restoreBackup('missing')).rejects.toThrow('Backup not found: missing');
  });

  it('transaction途中のput失敗時にDraftとCourseの片方だけを残さない', async () => {
    const fake = createFakeDatabase();
    const repository = new IndexedDbProgressRepository('test', async () => fake.database);
    await repository.open();
    await repository.putDraft(draft(1));
    await repository.putCourse(course('2026-07-10T00:00:01.000Z'));
    fake.failNextTransactionalPut('courses');

    await expect(
      repository.putDraftAndCourse(draft(2), course('2026-07-10T00:00:02.000Z')),
    ).rejects.toThrow('transactional put failed: courses');

    expect(fake.transactions.at(-1)?.doneObserved).toBe(true);
    expect((await repository.getDraft('fixture', 'workspace-1'))?.editRevision).toBe(1);
    expect((await repository.getCourse('fixture'))?.updatedAt).toBe('2026-07-10T00:00:01.000Z');
  });

  it('IndexedDB CASで同じworkspaceの永続ownerを1件だけ取得する', async () => {
    const fake = createFakeDatabase();
    const repository = new IndexedDbProgressRepository('test', async () => fake.database, {
      now: () => 1_000,
    });
    await repository.open();
    const leases = repository as unknown as {
      tryClaimWorkspaceLease(input: ReturnType<typeof leaseProof>): Promise<{
        readonly acquired: boolean;
        readonly proof?: ReturnType<typeof leaseProof>;
        readonly owner?: ReturnType<typeof leaseProof>;
      }>;
    };

    const first = await leases.tryClaimWorkspaceLease(leaseProof());
    const second = await leases.tryClaimWorkspaceLease(
      leaseProof({ ownerId: 'owner-b', token: 'token-b' }),
    );

    expect(first).toMatchObject({ acquired: true, proof: leaseProof() });
    expect(second).toMatchObject({ acquired: false, owner: leaseProof() });
    expect(
      [...fake.stores.metadata.values()].filter(
        (record) => (record as { readonly kind?: unknown }).kind === 'workspace-lease',
      ),
    ).toHaveLength(1);
  });

  it.each([
    ['ownerId', { ownerId: 'owner-b' }],
    ['token', { token: 'token-b' }],
    ['dataEpoch', { dataEpoch: 9 }],
    ['expiresAt', { expiresAt: 1_999 }],
  ])('fenced Draft writeでproofの%s不一致をtransaction内拒否する', async (_field, mismatch) => {
    const fake = createFakeDatabase();
    const repository = new IndexedDbProgressRepository('test', async () => fake.database, {
      now: () => 1_000,
    });
    await repository.open();
    const fenced = repository as unknown as {
      tryClaimWorkspaceLease(input: ReturnType<typeof leaseProof>): Promise<unknown>;
      putDraftFenced(value: ExerciseDraft, proof: ReturnType<typeof leaseProof>): Promise<void>;
    };
    await fenced.tryClaimWorkspaceLease(leaseProof());

    await expect(fenced.putDraftFenced(draft(2), leaseProof(mismatch))).rejects.toMatchObject({
      name: 'LeaseFenceRejectedError',
    });
    await expect(repository.getDraft('fixture', 'workspace-1')).resolves.toBeUndefined();
  });

  it('expired proofのheartbeatとDraft writeを拒否する', async () => {
    let now = 1_000;
    const fake = createFakeDatabase();
    const repository = new IndexedDbProgressRepository('test', async () => fake.database, {
      now: () => now,
    });
    await repository.open();
    const fenced = repository as unknown as {
      tryClaimWorkspaceLease(input: ReturnType<typeof leaseProof>): Promise<unknown>;
      heartbeatWorkspaceLease(
        proof: ReturnType<typeof leaseProof>,
        expiresAt: number,
      ): Promise<unknown>;
      putDraftFenced(value: ExerciseDraft, proof: ReturnType<typeof leaseProof>): Promise<void>;
    };
    await fenced.tryClaimWorkspaceLease(leaseProof());
    now = 2_000;

    await expect(fenced.heartbeatWorkspaceLease(leaseProof(), 3_000)).rejects.toMatchObject({
      name: 'LeaseFenceRejectedError',
    });
    await expect(fenced.putDraftFenced(draft(2), leaseProof())).rejects.toMatchObject({
      name: 'LeaseFenceRejectedError',
    });
  });

  it('backup作成・全置換・dataEpoch増分・lease無効化を1 transactionで完了する', async () => {
    const fake = createFakeDatabase();
    const repository = new IndexedDbProgressRepository('test', async () => fake.database, {
      now: () => 1_000,
      isoNow: () => '2026-07-16T00:00:00.000Z',
      id: () => 'atomic-backup',
    });
    await repository.open();
    await repository.putCourse(course());
    const durable = repository as unknown as {
      tryClaimWorkspaceLease(input: ReturnType<typeof leaseProof>): Promise<unknown>;
      replaceSnapshotWithBackup(
        snapshot: RepositorySnapshot,
        reason: 'before-import',
      ): Promise<{ readonly id: string; readonly snapshot: RepositorySnapshot }>;
      readWorkspaceLease(courseId: string, workspaceId: string): Promise<unknown>;
    };
    await durable.tryClaimWorkspaceLease(leaseProof());
    const replacement: RepositorySnapshot = {
      schemaVersion: 2,
      courses: {},
      drafts: {},
      quarantined: [],
    };

    const backup = await durable.replaceSnapshotWithBackup(replacement, 'before-import');

    expect(backup).toMatchObject({
      id: 'atomic-backup',
      snapshot: { courses: { fixture: course() } },
    });
    expect(await repository.snapshot()).toEqual(replacement);
    await expect(durable.readWorkspaceLease('fixture', 'workspace-1')).resolves.toBeUndefined();
    expect(fake.stores.metadata.get('dataEpoch')).toMatchObject({
      kind: 'data-epoch',
      value: 1,
    });
    await expect(
      durable.tryClaimWorkspaceLease(
        leaseProof({ ownerId: 'stale-owner', token: 'stale-token', dataEpoch: 0 }),
      ),
    ).resolves.toMatchObject({ acquired: false, reason: 'data-epoch-mismatch' });
    await expect(durable.readWorkspaceLease('fixture', 'workspace-1')).resolves.toBeUndefined();
    expect(fake.transactions).toContainEqual({
      stores: ['courses', 'drafts', 'quarantine', 'backups', 'metadata'],
      mode: 'readwrite',
      doneObserved: true,
    });
  });

  it('全置換前に読んだ追加・削除Course versionを無効化し、stale Slide CASを拒否する', async () => {
    const fake = createFakeDatabase();
    const repository = new IndexedDbProgressRepository('test', async () => fake.database, {
      now: () => 1_000,
      id: () => 'replacement-backup',
    });
    await repository.open();
    const stale = await repository.getCourseVersioned('fixture');
    const replacementCourse = course('2026-07-16T00:00:00.000Z');
    await repository.replaceSnapshotWithBackup(
      {
        schemaVersion: 2,
        courses: { fixture: replacementCourse },
        drafts: {},
        quarantined: [],
      },
      'before-import',
    );

    await expect(
      repository.putCourseVersioned(course('2026-07-10T00:00:01.000Z'), stale.version),
    ).rejects.toMatchObject({ name: 'CourseProgressVersionConflictError' });
    await expect(repository.getCourse('fixture')).resolves.toEqual(replacementCourse);

    const staleBeforeDelete = await repository.getCourseVersioned('fixture');
    await repository.replaceSnapshot({
      schemaVersion: 2,
      courses: {},
      drafts: {},
      quarantined: [],
    });
    await expect(
      repository.putCourseVersioned(replacementCourse, staleBeforeDelete.version),
    ).rejects.toMatchObject({ name: 'CourseProgressVersionConflictError' });
    const deleted = await repository.getCourseVersioned('fixture');
    expect(deleted.progress).toBeUndefined();
    expect(deleted.version).toBe(staleBeforeDelete.version + 1);
  });

  it('別workspaceのCourse更新競合を検出し、再読込merge後は両方のLessonを保持する', async () => {
    const fake = createFakeDatabase();
    const repository = new IndexedDbProgressRepository('test', async () => fake.database, {
      now: () => 1_000,
    });
    await repository.open();
    const durable = repository as unknown as {
      tryClaimWorkspaceLease(input: ReturnType<typeof leaseProof>): Promise<unknown>;
      getCourseVersioned(
        courseId: string,
      ): Promise<{ readonly version: number; readonly progress?: CourseProgress }>;
      putDraftAndCourseFenced(
        value: ExerciseDraft,
        progress: CourseProgress,
        proof: ReturnType<typeof leaseProof>,
        expectedCourseVersion: number,
      ): Promise<number>;
    };
    const proofA = leaseProof();
    const proofB = leaseProof({
      workspaceId: 'workspace-2',
      ownerId: 'owner-b',
      token: 'token-b',
    });
    await durable.tryClaimWorkspaceLease(proofA);
    await durable.tryClaimWorkspaceLease(proofB);
    const staleA = await durable.getCourseVersioned('fixture');
    const staleB = await durable.getCourseVersioned('fixture');
    const lessonA = {
      lessonId: 'lesson-a',
      viewedSlideIds: [],
      passedExerciseIds: [],
      passedChecklistItemIds: [],
      passedRuleIds: [],
      passedViewportIds: [],
      currentComplete: false,
    };
    const lessonB = { ...lessonA, lessonId: 'lesson-b' };
    await durable.putDraftAndCourseFenced(
      draft(1),
      { ...course(), lessons: { 'lesson-a': lessonA } },
      proofA,
      staleA.version,
    );

    await expect(
      durable.putDraftAndCourseFenced(
        draft(1, 'workspace-2'),
        { ...course('2026-07-10T00:00:02.000Z'), lessons: { 'lesson-b': lessonB } },
        proofB,
        staleB.version,
      ),
    ).rejects.toMatchObject({ name: 'CourseProgressVersionConflictError' });
    expect((await repository.getDraft('fixture', 'workspace-1'))?.editRevision).toBe(1);
    await expect(repository.getDraft('fixture', 'workspace-2')).resolves.toBeUndefined();

    const latest = await durable.getCourseVersioned('fixture');
    expect(latest.progress).toBeDefined();
    await durable.putDraftAndCourseFenced(
      draft(1, 'workspace-2'),
      {
        ...latest.progress!,
        lessons: { ...latest.progress!.lessons, 'lesson-b': lessonB },
        updatedAt: '2026-07-10T00:00:02.000Z',
      },
      proofB,
      latest.version,
    );

    const merged = await durable.getCourseVersioned('fixture');
    expect(Object.keys(merged.progress?.lessons ?? {})).toEqual(['lesson-a', 'lesson-b']);
  });

  it('Exercise更新後の古いSlide更新を拒否し、再計算後は同一Lessonの両証跡を保持する', async () => {
    const fake = createFakeDatabase();
    const repository = new IndexedDbProgressRepository('test', async () => fake.database, {
      now: () => 1_000,
    });
    await repository.open();
    await repository.tryClaimWorkspaceLease(leaseProof());
    const staleSlide = await repository.getCourseVersioned('fixture');
    const exerciseRead = await repository.getCourseVersioned('fixture');
    const exerciseLesson = {
      lessonId: 'lesson-shared',
      viewedSlideIds: [],
      passedExerciseIds: ['exercise-a'],
      passedChecklistItemIds: [],
      passedRuleIds: [],
      passedViewportIds: [],
      currentComplete: false,
    };
    await repository.putDraftAndCourseFenced(
      draft(1),
      { ...course(), lessons: { 'lesson-shared': exerciseLesson } },
      leaseProof(),
      exerciseRead.version,
    );
    const staleSlideLesson = {
      ...exerciseLesson,
      viewedSlideIds: ['slide-a'],
      passedExerciseIds: [],
    };

    await expect(
      repository.putCourseVersioned(
        { ...course(), lessons: { 'lesson-shared': staleSlideLesson } },
        staleSlide.version,
      ),
    ).rejects.toMatchObject({ name: 'CourseProgressVersionConflictError' });

    const latest = await repository.getCourseVersioned('fixture');
    const latestLesson = latest.progress?.lessons['lesson-shared'];
    expect(latestLesson).toBeDefined();
    await repository.putCourseVersioned(
      {
        ...latest.progress!,
        lessons: {
          ...latest.progress!.lessons,
          'lesson-shared': { ...latestLesson!, viewedSlideIds: ['slide-a'] },
        },
      },
      latest.version,
    );

    const merged = (await repository.getCourseVersioned('fixture')).progress?.lessons[
      'lesson-shared'
    ];
    expect(merged).toMatchObject({
      viewedSlideIds: ['slide-a'],
      passedExerciseIds: ['exercise-a'],
    });
  });
});
