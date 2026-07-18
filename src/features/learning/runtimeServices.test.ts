import { describe, expect, it, vi } from 'vitest';
import { fixtureCourse } from '../../../tests/fixtures/course';
import { ResilientProgressService } from '../../core/persistence/ResilientProgressService';
import { TabLeaseCoordinator } from '../../core/persistence/TabLeaseCoordinator';
import {
  CourseProgressVersionConflictError,
  type ProgressRepository,
} from '../../core/persistence/contracts';
import type { ContentProgressMigrationService } from '../../core/persistence/contentProgressMigration';
import type { PassFreshnessRegistry } from '../../core/persistence/PassFreshnessRegistry';
import type {
  PreviewSnapshot,
  RunnerInput,
  RunnerRenderResult,
  SnapshotRequest,
} from '../../core/runtime/contracts';
import type { RuntimeNoticeStore } from './runtimeNotices';
import { createLearningRuntimeServices } from './runtimeServices';

const lazyRunner = vi.hoisted(() => ({
  construct: vi.fn(),
  prepare: vi.fn<(frame: HTMLIFrameElement) => Promise<void>>(async () => undefined),
  render: vi.fn<(input: RunnerInput) => Promise<RunnerRenderResult>>((input) =>
    Promise.resolve({
      exerciseSessionId: input.exerciseSessionId,
      executionRevision: input.executionRevision,
      diagnostics: [],
    }),
  ),
  requestSnapshot: vi.fn<(request: SnapshotRequest) => Promise<PreviewSnapshot>>(() =>
    Promise.reject(new Error('このTestではsnapshotを要求しません')),
  ),
  dispose: vi.fn<() => Promise<void>>(async () => undefined),
}));

const lazyReadOnlyPreview = vi.hoisted(() => ({
  construct: vi.fn(),
  prepare: vi.fn<(frame: HTMLIFrameElement) => Promise<void>>(async () => undefined),
  render: vi.fn<(input: RunnerInput) => Promise<void>>(async () => undefined),
  dispose: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock('../../adapters/runtime/html-css', () => ({
  HtmlCssRunnerAdapter: class {
    readonly languageId = 'html-css';

    constructor() {
      lazyRunner.construct();
    }

    /** Mock frame初期化を観測する。 */
    prepare(frame: HTMLIFrameElement): Promise<void> {
      return lazyRunner.prepare(frame);
    }

    /** Mock描画を観測する。 */
    render(input: RunnerInput): Promise<RunnerRenderResult> {
      return lazyRunner.render(input);
    }

    /** Mock snapshot要求を観測する。 */
    requestSnapshot(request: SnapshotRequest): Promise<PreviewSnapshot> {
      return lazyRunner.requestSnapshot(request);
    }

    /** Mock解放を観測する。 */
    dispose(): Promise<void> {
      return lazyRunner.dispose();
    }
  },
}));

vi.mock('../../adapters/runtime/read-only-html-css/HtmlCssReadOnlyPreviewAdapter', () => ({
  HtmlCssReadOnlyPreviewAdapter: class {
    readonly languageId = 'html-css';

    constructor() {
      lazyReadOnlyPreview.construct();
    }

    /** Mock静的frame初期化を観測する。 */
    prepare(frame: HTMLIFrameElement): Promise<void> {
      return lazyReadOnlyPreview.prepare(frame);
    }

    /** Mock静的描画を観測する。 */
    render(input: RunnerInput): Promise<void> {
      return lazyReadOnlyPreview.render(input);
    }

    /** Mock静的資源解放を観測する。 */
    dispose(): Promise<void> {
      return lazyReadOnlyPreview.dispose();
    }
  },
}));

interface RepositoryHarness {
  readonly repository: ProgressRepository;
  readonly open: ReturnType<typeof vi.fn<ProgressRepository['open']>>;
}

/** Task 12で利用するRepository境界と観測spyを副作用なしで返す。 */
function repositoryHarness(): RepositoryHarness {
  const open = vi.fn<ProgressRepository['open']>(async () => undefined);
  return {
    repository: {
      open,
      getCourse: vi.fn().mockResolvedValue(undefined),
      getCourseVersioned: vi.fn().mockResolvedValue({ version: 0 }),
      putCourse: vi.fn().mockResolvedValue(undefined),
      putCourseVersioned: vi.fn().mockResolvedValue(1),
      getDraft: vi.fn().mockResolvedValue(undefined),
      putDraft: vi.fn().mockResolvedValue(undefined),
      putDraftFenced: vi.fn().mockResolvedValue(undefined),
      putDraftAndCourse: vi.fn().mockResolvedValue(undefined),
      putDraftAndCourseFenced: vi.fn().mockResolvedValue(1),
      snapshot: vi.fn().mockResolvedValue({
        schemaVersion: 2,
        courses: {},
        drafts: {},
        quarantined: [],
      }),
      replaceSnapshot: vi.fn().mockResolvedValue(undefined),
      replaceSnapshotWithBackup: vi.fn().mockResolvedValue({
        id: 'backup-atomic',
        reason: 'recovery',
        createdAt: '2026-07-16T00:00:00.000Z',
        snapshot: { schemaVersion: 2, courses: {}, drafts: {}, quarantined: [] },
      }),
      createBackup: vi.fn().mockResolvedValue({
        id: 'backup-1',
        reason: 'recovery',
        createdAt: '2026-07-16T00:00:00.000Z',
        snapshot: { schemaVersion: 2, courses: {}, drafts: {}, quarantined: [] },
      }),
      restoreBackup: vi.fn().mockResolvedValue(undefined),
      quarantine: vi.fn().mockResolvedValue(undefined),
      tryClaimWorkspaceLease: vi.fn().mockResolvedValue({
        acquired: true,
        proof: {
          courseId: 'html-css',
          workspaceId: 'workspace-1',
          ownerId: 'owner-a',
          token: 'token-a',
          dataEpoch: 0,
          expiresAt: 2_000,
        },
      }),
      readWorkspaceLease: vi.fn().mockResolvedValue(undefined),
      heartbeatWorkspaceLease: vi
        .fn<ProgressRepository['heartbeatWorkspaceLease']>()
        .mockImplementation(async (proof, expiresAt) => ({ ...proof, expiresAt })),
      releaseWorkspaceLease: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    },
    open,
  };
}

describe('createLearningRuntimeServices', () => {
  it('明示注入したTabLeaseCoordinatorを同一instanceで返す', () => {
    const { repository } = repositoryHarness();
    const leaseCoordinator = new TabLeaseCoordinator({
      channelFactory: () => {
        throw new Error('coordination unavailable');
      },
      storage: undefined,
    });

    const services = createLearningRuntimeServices({ repository, leaseCoordinator });

    expect(services.leaseCoordinator).toBe(leaseCoordinator);
    leaseCoordinator.dispose();
  });

  it('raw RepositoryをResilient層で包み、migrationとTransferが使う同じ公開instanceを返す', async () => {
    const { repository } = repositoryHarness();
    const services = createLearningRuntimeServices({ repository });

    expect(services.progressService).toBeInstanceOf(ResilientProgressService);
    expect(services.repository).toBe(services.progressService);
    expect(services.repository).not.toBe(repository);
    expect(services.transferService).toBeDefined();

    await expect(services.ready).resolves.toBeUndefined();
  });

  it('Repository open失敗をmemory-onlyへ救済してreadyをrejectしない', async () => {
    const { repository, open } = repositoryHarness();
    open.mockRejectedValueOnce(new Error('IndexedDB blocked'));
    const services = createLearningRuntimeServices({ repository });

    await expect(services.ready).resolves.toBeUndefined();

    expect(services.progressService.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      cause: 'open',
    });
  });

  it('Transfer用Course読込をsingle-flight成功cacheし、失敗時は次回再試行する', async () => {
    const { repository } = repositoryHarness();
    const loadTransferCourses = vi
      .fn<() => Promise<readonly (typeof fixtureCourse)[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([fixtureCourse]);
    const services = createLearningRuntimeServices({ repository, loadTransferCourses });

    await expect(services.prepareTransferCatalog()).rejects.toThrow('offline');
    await expect(
      Promise.all([services.prepareTransferCatalog(), services.prepareTransferCatalog()]),
    ).resolves.toEqual([undefined, undefined]);

    expect(loadTransferCourses).toHaveBeenCalledTimes(2);
  });

  it('memory-onlyからの復旧後に成功cache済みCourse migrationを再評価する', async () => {
    const { repository, open } = repositoryHarness();
    open.mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(undefined);
    const ensureStoredCourse = vi.fn().mockResolvedValue([]);
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: {
        registerCourse: vi.fn(),
        ensureStoredCourse,
      } as unknown as ContentProgressMigrationService,
      notices: { addMigrationNotices: vi.fn() } as unknown as RuntimeNoticeStore,
      passFreshness: {} as PassFreshnessRegistry,
    });
    await services.ensureCourse(fixtureCourse);
    expect(services.progressService.getHealthSnapshot().kind).toBe('memory-only');

    await expect(services.retryPersistence()).resolves.toEqual({ kind: 'recovered' });

    expect(open).toHaveBeenCalledTimes(2);
    expect(ensureStoredCourse).toHaveBeenCalledTimes(2);
  });

  it('既定Runnerは同期Registry契約を保ち、本体を初回prepareまで遅延生成する', async () => {
    lazyRunner.construct.mockClear();
    lazyRunner.prepare.mockClear();
    lazyRunner.dispose.mockClear();
    const { repository } = repositoryHarness();
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: {
        registerCourse: vi.fn(),
        ensureStoredCourse: vi.fn().mockResolvedValue([]),
      } as unknown as ContentProgressMigrationService,
      notices: { addMigrationNotices: vi.fn() } as unknown as RuntimeNoticeStore,
      passFreshness: {} as PassFreshnessRegistry,
    });

    const runner = services.runnerRegistry.create('html-css');
    expect(runner.languageId).toBe('html-css');
    expect(lazyRunner.construct).not.toHaveBeenCalled();

    const frame = document.createElement('iframe');
    await runner.prepare(frame);
    expect(lazyRunner.construct).toHaveBeenCalledOnce();
    expect(lazyRunner.prepare).toHaveBeenCalledWith(frame);

    await runner.dispose();
    expect(lazyRunner.dispose).toHaveBeenCalledOnce();
  });

  it('read-only RegistryはFull Runnerと独立し、静的adapterだけを初回prepareまで遅延生成する', async () => {
    lazyRunner.construct.mockClear();
    lazyReadOnlyPreview.construct.mockClear();
    lazyReadOnlyPreview.prepare.mockClear();
    const { repository } = repositoryHarness();
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: {
        registerCourse: vi.fn(),
        ensureStoredCourse: vi.fn().mockResolvedValue([]),
      } as unknown as ContentProgressMigrationService,
      notices: { addMigrationNotices: vi.fn() } as unknown as RuntimeNoticeStore,
      passFreshness: {} as PassFreshnessRegistry,
    });

    const preview = services.readOnlyPreviewRegistry.create('html-css');
    expect(preview.languageId).toBe('html-css');
    expect(lazyReadOnlyPreview.construct).not.toHaveBeenCalled();
    expect(lazyRunner.construct).not.toHaveBeenCalled();

    const frame = document.createElement('iframe');
    await preview.prepare(frame);
    expect(lazyReadOnlyPreview.construct).toHaveBeenCalledOnce();
    expect(lazyReadOnlyPreview.prepare).toHaveBeenCalledWith(frame);
    expect(lazyRunner.construct).not.toHaveBeenCalled();
  });

  it('Runner本体の初回生成失敗をcacheせず、同じAdapterの次回prepareで回復する', async () => {
    lazyRunner.construct.mockReset().mockImplementationOnce(() => {
      throw new Error('chunk load failed');
    });
    lazyRunner.prepare.mockClear();
    const { repository } = repositoryHarness();
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: {
        registerCourse: vi.fn(),
        ensureStoredCourse: vi.fn().mockResolvedValue([]),
      } as unknown as ContentProgressMigrationService,
      notices: { addMigrationNotices: vi.fn() } as unknown as RuntimeNoticeStore,
      passFreshness: {} as PassFreshnessRegistry,
    });
    const runner = services.runnerRegistry.create('html-css');
    const frame = document.createElement('iframe');

    await expect(runner.prepare(frame)).rejects.toThrow('chunk load failed');
    await expect(runner.prepare(frame)).resolves.toBeUndefined();

    expect(lazyRunner.construct).toHaveBeenCalledTimes(2);
    expect(lazyRunner.prepare).toHaveBeenCalledOnce();
  });

  it('Repository openと同一Course revisionのmigrationをsingle-flightにし、Noticeを一度だけ保持する', async () => {
    const { repository, open } = repositoryHarness();
    let resolveMigration!: () => void;
    const registerCourse = vi.fn();
    const ensureStoredCourse = vi.fn(
      () =>
        new Promise<readonly { id: string; courseId: string; reason: string }[]>((resolve) => {
          resolveMigration = () => {
            resolve([{ id: 'notice-1', courseId: fixtureCourse.id, reason: '旧Exerciseを初期化' }]);
          };
        }),
    );
    const migrations = {
      registerCourse,
      ensureStoredCourse,
    } as unknown as ContentProgressMigrationService;
    const addMigrationNotices = vi.fn();
    const notices = {
      addMigrationNotices,
    } as unknown as RuntimeNoticeStore;
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: migrations,
      notices,
      passFreshness: {} as PassFreshnessRegistry,
    });

    const first = services.ensureCourse(fixtureCourse);
    const concurrent = services.ensureCourse(fixtureCourse);
    expect(open).toHaveBeenCalledOnce();
    expect(registerCourse).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(ensureStoredCourse).toHaveBeenCalledOnce();
    });

    resolveMigration();
    await Promise.all([first, concurrent]);
    await services.ensureCourse(fixtureCourse);

    expect(ensureStoredCourse).toHaveBeenCalledOnce();
    expect(addMigrationNotices).toHaveBeenCalledOnce();
    expect(addMigrationNotices).toHaveBeenCalledWith([
      { id: 'notice-1', courseId: fixtureCourse.id, reason: '旧Exerciseを初期化' },
    ]);
  });

  it('migration失敗はcacheせず、同じRouteの再試行で成功できる', async () => {
    const { repository, open } = repositoryHarness();
    const ensureStoredCourse = vi
      .fn()
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce([]);
    const migrations = {
      registerCourse: vi.fn(),
      ensureStoredCourse,
    } as unknown as ContentProgressMigrationService;
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: migrations,
      notices: { addMigrationNotices: vi.fn() } as unknown as RuntimeNoticeStore,
      passFreshness: {} as PassFreshnessRegistry,
    });

    await expect(services.ensureCourse(fixtureCourse)).rejects.toThrow('quota');
    await expect(services.ensureCourse(fixtureCourse)).resolves.toBeUndefined();
    expect(ensureStoredCourse).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledOnce();
  });

  it('同じCourseでも新しいcontent revisionは別migrationとして実行する', async () => {
    const { repository } = repositoryHarness();
    const registerCourse = vi.fn();
    const ensureStoredCourse = vi.fn().mockResolvedValue([]);
    const migrations = {
      registerCourse,
      ensureStoredCourse,
    } as unknown as ContentProgressMigrationService;
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: migrations,
      notices: { addMigrationNotices: vi.fn() } as unknown as RuntimeNoticeStore,
      passFreshness: {} as PassFreshnessRegistry,
    });
    const nextRevision = { ...fixtureCourse, revision: '2026-07-10.2' };

    await services.ensureCourse(fixtureCourse);
    await services.ensureCourse(nextRevision);

    expect(ensureStoredCourse).toHaveBeenCalledTimes(2);
    expect(registerCourse).toHaveBeenNthCalledWith(2, nextRevision);
  });

  it('同一Courseのread-modify-writeを直列化し、並行Mutationでも更新を失わない', async () => {
    const { repository } = repositoryHarness();
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: {
        registerCourse: vi.fn(),
        ensureStoredCourse: vi.fn().mockResolvedValue([]),
      } as unknown as ContentProgressMigrationService,
      notices: { addMigrationNotices: vi.fn() } as unknown as RuntimeNoticeStore,
      passFreshness: {} as PassFreshnessRegistry,
    });
    let storedProgressVersion = 0;
    let readCount = 0;
    let releaseFirst!: () => void;
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const mutate = (waitBeforeWrite: boolean): Promise<void> =>
      services.runCourseProgressMutation(fixtureCourse.id, async () => {
        const readVersion = storedProgressVersion;
        readCount += 1;
        if (waitBeforeWrite) await firstWriteGate;
        storedProgressVersion = readVersion + 1;
      });

    const first = mutate(true);
    await vi.waitFor(() => {
      expect(readCount).toBe(1);
    });
    const concurrent = mutate(false);
    await Promise.resolve();
    expect(readCount).toBe(1);

    releaseFirst();
    await Promise.all([first, concurrent]);

    expect(readCount).toBe(2);
    expect(storedProgressVersion).toBe(2);
  });

  it('失敗したCourse mutationをqueueから除き、後続Mutationを継続する', async () => {
    const { repository } = repositoryHarness();
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: {
        registerCourse: vi.fn(),
        ensureStoredCourse: vi.fn().mockResolvedValue([]),
      } as unknown as ContentProgressMigrationService,
      notices: { addMigrationNotices: vi.fn() } as unknown as RuntimeNoticeStore,
      passFreshness: {} as PassFreshnessRegistry,
    });

    await expect(
      services.runCourseProgressMutation(fixtureCourse.id, () =>
        Promise.reject(new Error('quota')),
      ),
    ).rejects.toThrow('quota');
    await expect(
      services.runCourseProgressMutation(fixtureCourse.id, () => Promise.resolve('saved')),
    ).resolves.toBe('saved');
  });

  it('Course version conflict時に最新値を再読込してpure mutationをbounded retryする', async () => {
    const { repository } = repositoryHarness();
    const services = createLearningRuntimeServices({
      repository,
      contentMigrations: {
        registerCourse: vi.fn(),
        ensureStoredCourse: vi.fn().mockResolvedValue([]),
      } as unknown as ContentProgressMigrationService,
      notices: { addMigrationNotices: vi.fn() } as unknown as RuntimeNoticeStore,
      passFreshness: {} as PassFreshnessRegistry,
    });
    let stored = { lessons: [] as string[], version: 0 };
    let attempts = 0;

    await services.runCourseProgressMutation(fixtureCourse.id, async () => {
      attempts += 1;
      const read = structuredClone(stored);
      const next = { lessons: [...read.lessons, 'workspace-a'], version: read.version + 1 };
      if (attempts === 1) {
        stored = { lessons: ['workspace-b'], version: 1 };
        throw new CourseProgressVersionConflictError();
      }
      stored = next;
    });

    expect(attempts).toBe(2);
    expect(stored.lessons).toEqual(['workspace-b', 'workspace-a']);
  });
});
