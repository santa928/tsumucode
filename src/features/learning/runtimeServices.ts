/** 学習routeが共有するRepository・migration・Runner・Validatorの依存を構築する。 */
import { IndexedDbProgressRepository } from '../../adapters/persistence/indexeddb';
import {
  loadCourseCatalog,
  loadCourseCatalogV3,
  loadCourseIndex,
  loadCourseManifest,
} from '../../core/content/loadCourseCatalog';
import type { CourseIndex, CourseManifest } from '../../core/content/types';
import {
  ContentProgressMigrationService,
  type ContentMigrationNotice,
} from '../../core/persistence/contentProgressMigration';
import { PassFreshnessRegistry } from '../../core/persistence/PassFreshnessRegistry';
import { TabLeaseCoordinator } from '../../core/persistence/TabLeaseCoordinator';
import {
  ResilientProgressService,
  type PersistenceConflictResolution,
  type PersistenceRetryResult,
} from '../../core/persistence/ResilientProgressService';
import {
  CourseProgressVersionConflictError,
  type ProgressRepository,
} from '../../core/persistence/contracts';
import type { ImportPreview, TransferServicePort } from '../../core/persistence/transferService';
import type {
  PreviewSnapshot,
  ReadOnlyPreviewAdapter,
  RunnerAdapter,
  RunnerInput,
  RunnerRenderResult,
  SnapshotRequest,
} from '../../core/runtime/contracts';
import { ReadOnlyPreviewRegistry } from '../../core/runtime/ReadOnlyPreviewRegistry';
import { RunnerRegistry, type RunnerFactory } from '../../core/runtime/RunnerRegistry';
import { ValidatorRegistry, type ValidatorFactory } from '../../core/validation/ValidatorRegistry';
import {
  EditorLanguageRegistry,
  type EditorLanguageFactory,
} from './editor/EditorLanguageRegistry';
import { RuntimeNoticeStore } from './runtimeNotices';

export interface CourseIndexRuntimeRegistration {
  ensureCourseIndex(index: CourseIndex): Promise<readonly ContentMigrationNotice[]>;
}

export interface LearningRuntimeServices extends CourseIndexRuntimeRegistration {
  readonly repository: ResilientProgressService;
  readonly progressService: ResilientProgressService;
  readonly passFreshness: PassFreshnessRegistry;
  readonly contentMigrations: ContentProgressMigrationService;
  readonly transferService: TransferServicePort;
  readonly leaseCoordinator: TabLeaseCoordinator;
  readonly notices: RuntimeNoticeStore;
  readonly runnerRegistry: RunnerRegistry;
  readonly readOnlyPreviewRegistry: ReadOnlyPreviewRegistry;
  readonly validatorRegistry: ValidatorRegistry;
  readonly editorLanguageRegistry: EditorLanguageRegistry;
  readonly ready: Promise<void>;
  prepareTransferCatalog(): Promise<void>;
  retryPersistence(): Promise<PersistenceRetryResult>;
  resolvePersistenceConflict(resolution: PersistenceConflictResolution): Promise<void>;
  ensureCourse(course: CourseManifest): Promise<void>;
  runCourseProgressMutation<Result>(
    courseId: string,
    mutation: () => Promise<Result>,
  ): Promise<Result>;
}

export interface LearningRuntimeServiceOptions {
  readonly repository?: ProgressRepository;
  readonly progressService?: ResilientProgressService;
  readonly passFreshness?: PassFreshnessRegistry;
  readonly contentMigrations?: ContentProgressMigrationService;
  readonly transferService?: TransferServicePort;
  readonly leaseCoordinator?: TabLeaseCoordinator;
  readonly loadTransferCourses?: () => Promise<readonly CourseManifest[]>;
  readonly notices?: RuntimeNoticeStore;
  readonly runnerRegistry?: RunnerRegistry;
  readonly runnerRegistrations?: readonly (readonly [string, RunnerFactory])[];
  readonly readOnlyPreviewRegistry?: ReadOnlyPreviewRegistry;
  readonly validatorRegistry?: ValidatorRegistry;
  readonly validatorRegistrations?: readonly (readonly [string, ValidatorFactory])[];
  readonly editorLanguageRegistry?: EditorLanguageRegistry;
  readonly editorRegistrations?: readonly (readonly [string, EditorLanguageFactory])[];
}

const APP_VERSION = '0.1.0';

/** 端末データ操作が選ばれるまでTransfer実装と移行Schemaを配信chunkから分離する。 */
class LazyTransferService implements TransferServicePort {
  #delegate: TransferServicePort | undefined;
  #delegatePromise: Promise<TransferServicePort> | undefined;

  /** TransferService生成に必要な保存境界と教材migrationを保持する。 */
  constructor(
    private readonly repository: ProgressRepository,
    private readonly migrations: ContentProgressMigrationService,
  ) {}

  /** import・生成失敗だけをcacheから除き、次回操作で再試行できるようにする。 */
  #load(): Promise<TransferServicePort> {
    if (this.#delegate !== undefined) return Promise.resolve(this.#delegate);
    if (this.#delegatePromise === undefined) {
      const pending = import('../../core/persistence/transferService').then(
        ({ TransferService }) => {
          const delegate = new TransferService(this.repository, this.migrations, {
            appVersion: APP_VERSION,
            now: () => new Date().toISOString(),
          });
          this.#delegate = delegate;
          return delegate;
        },
      );
      const recoverable = pending.catch((error: unknown) => {
        if (this.#delegatePromise === recoverable) this.#delegatePromise = undefined;
        throw error;
      });
      this.#delegatePromise = recoverable;
    }
    return this.#delegatePromise;
  }

  /** 初回書き出し時にTransfer実装を読み込んで委譲する。 */
  async exportAll(): Promise<string> {
    return (await this.#load()).exportAll();
  }

  /** 初回読み込み検証時にTransfer実装を読み込んで委譲する。 */
  async prepareImport(raw: string): Promise<ImportPreview> {
    return (await this.#load()).prepareImport(raw);
  }

  /** 適用前には必ず準備済みdelegateがあるため、同じinstanceへ委譲する。 */
  async applyImport(previewId: string): Promise<void> {
    await (await this.#load()).applyImport(previewId);
  }

  /** 未読込時は破棄対象が存在しないためfalseを返し、同期契約を維持する。 */
  discardImport(previewId: string): boolean {
    return this.#delegate?.discardImport(previewId) ?? false;
  }
}

/** Catalogの全Course ManifestをGitHub Pagesの現在Base Pathから検証済みで読み込む。 */
async function loadTransferCoursesFromCatalog(): Promise<readonly CourseManifest[]> {
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  return Promise.all(
    catalog.courses.map((entry) => loadCourseManifest(import.meta.env.BASE_URL, entry)),
  );
}

/** Catalog v3の全Course IndexをGitHub Pagesの現在Base Pathから検証済みで読み込む。 */
export async function loadTransferCourseIndexesFromCatalog(): Promise<readonly CourseIndex[]> {
  const catalog = await loadCourseCatalogV3(import.meta.env.BASE_URL);
  return Promise.all(
    catalog.courses.map((entry) => loadCourseIndex(import.meta.env.BASE_URL, entry)),
  );
}

/** Web Crypto非対応時も衝突しにくいmigration record IDを生成する。 */
function migrationId(): string {
  try {
    const cryptoValue: unknown = Reflect.get(globalThis, 'crypto');
    if (
      typeof cryptoValue === 'object' &&
      cryptoValue !== null &&
      typeof Reflect.get(cryptoValue, 'randomUUID') === 'function'
    ) {
      return (cryptoValue as { randomUUID(): string }).randomUUID();
    }
  } catch {
    // fallbackへ進む。
  }
  return `migration-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** HTML/CSS Runner本体を最初の利用時まで配信chunkから分離する。 */
class LazyHtmlCssRunnerAdapter implements RunnerAdapter {
  readonly languageId = 'html-css';
  #delegatePromise: Promise<RunnerAdapter> | undefined;

  /** import・生成失敗だけをcacheから除き、同じAdapterの次回操作で再試行できるようにする。 */
  #delegate(): Promise<RunnerAdapter> {
    if (this.#delegatePromise === undefined) {
      const pending = import('../../adapters/runtime/html-css').then(
        ({ HtmlCssRunnerAdapter }) => new HtmlCssRunnerAdapter(),
      );
      const recoverable = pending.catch((error: unknown) => {
        if (this.#delegatePromise === recoverable) this.#delegatePromise = undefined;
        throw error;
      });
      this.#delegatePromise = recoverable;
    }
    return this.#delegatePromise;
  }

  /** 実frameが必要になるまでRunner chunkを読み込まず、初回prepareへ委譲する。 */
  async prepare(frame: HTMLIFrameElement): Promise<void> {
    const delegate = await this.#delegate();
    await delegate.prepare(frame);
  }

  /** 読込済みまたは読込中のRunnerへ描画を委譲する。 */
  async render(input: RunnerInput): Promise<RunnerRenderResult> {
    const delegate = await this.#delegate();
    return delegate.render(input);
  }

  /** 読込済みまたは読込中のRunnerへDOM観測を委譲する。 */
  async requestSnapshot(request: SnapshotRequest): Promise<PreviewSnapshot> {
    const delegate = await this.#delegate();
    return delegate.requestSnapshot(request);
  }

  /** 未利用時はchunkを読み込まず、利用済みRunnerだけを解放する。 */
  async dispose(): Promise<void> {
    if (this.#delegatePromise === undefined) return;
    const delegate = await this.#delegatePromise;
    await delegate.dispose();
  }
}

/** 静的HTML/CSS Previewを最初の利用時まで配信chunkから分離する。 */
class LazyHtmlCssReadOnlyPreviewAdapter implements ReadOnlyPreviewAdapter {
  readonly languageId = 'html-css';
  #delegatePromise: Promise<ReadOnlyPreviewAdapter> | undefined;

  /** import・生成失敗だけをcacheから除き、次回操作で再試行できるようにする。 */
  #delegate(): Promise<ReadOnlyPreviewAdapter> {
    if (this.#delegatePromise === undefined) {
      const pending =
        import('../../adapters/runtime/read-only-html-css/HtmlCssReadOnlyPreviewAdapter').then(
          ({ HtmlCssReadOnlyPreviewAdapter }) => new HtmlCssReadOnlyPreviewAdapter(),
        );
      const recoverable = pending.catch((error: unknown) => {
        if (this.#delegatePromise === recoverable) this.#delegatePromise = undefined;
        throw error;
      });
      this.#delegatePromise = recoverable;
    }
    return this.#delegatePromise;
  }

  /** 実frameが必要になるまで静的adapter chunkを読み込まない。 */
  async prepare(frame: HTMLIFrameElement): Promise<void> {
    const delegate = await this.#delegate();
    await delegate.prepare(frame);
  }

  /** 読込済みまたは読込中の静的adapterへ描画を委譲する。 */
  async render(input: RunnerInput): Promise<void> {
    const delegate = await this.#delegate();
    await delegate.render(input);
  }

  /** 未利用時はchunkを読み込まず、利用済みadapterだけを解放する。 */
  async dispose(): Promise<void> {
    if (this.#delegatePromise === undefined) return;
    const delegate = await this.#delegatePromise;
    await delegate.dispose();
  }
}

/** HTML/CSS用Runner factoryを登録済みの既定Registryとして返す。 */
function createRunnerRegistry(): RunnerRegistry {
  const registry = new RunnerRegistry();
  registry.register('html-css', () => new LazyHtmlCssRunnerAdapter());
  return registry;
}

/** HTML/CSS用静的Preview factoryを登録済みの既定Registryとして返す。 */
function createReadOnlyPreviewRegistry(): ReadOnlyPreviewRegistry {
  const registry = new ReadOnlyPreviewRegistry();
  registry.register('html-css', () => new LazyHtmlCssReadOnlyPreviewAdapter());
  return registry;
}

/** Validator実装を編集画面のlazy chunkへ残した空の既定Registryを返す。 */
function createValidatorRegistry(): ValidatorRegistry {
  return new ValidatorRegistry();
}

/** 注入可能な学習Runtimeを作り、Repository openと教材移行を再試行可能に直列化する。 */
export function createLearningRuntimeServices(
  options: LearningRuntimeServiceOptions = {},
): LearningRuntimeServices {
  const rawRepository =
    options.repository ?? options.progressService ?? new IndexedDbProgressRepository();
  const progressService =
    options.progressService ??
    (rawRepository instanceof ResilientProgressService
      ? rawRepository
      : new ResilientProgressService(rawRepository));
  const repository = progressService;
  const passFreshness = options.passFreshness ?? new PassFreshnessRegistry();
  const notices =
    options.notices ??
    new RuntimeNoticeStore({
      isPersistenceDegraded: () => {
        const { kind } = progressService.getHealthSnapshot();
        return kind !== 'initializing' && kind !== 'healthy';
      },
    });
  const contentMigrations =
    options.contentMigrations ??
    new ContentProgressMigrationService(repository, { id: migrationId });
  const transferService =
    options.transferService ?? new LazyTransferService(repository, contentMigrations);
  const leaseCoordinator =
    options.leaseCoordinator ?? new TabLeaseCoordinator({ leasePersistence: progressService });
  const loadTransferCourses = options.loadTransferCourses ?? loadTransferCoursesFromCatalog;
  const runnerRegistry = options.runnerRegistry ?? createRunnerRegistry();
  for (const [id, factory] of options.runnerRegistrations ?? []) {
    runnerRegistry.register(id, factory);
  }
  const readOnlyPreviewRegistry =
    options.readOnlyPreviewRegistry ?? createReadOnlyPreviewRegistry();
  const validatorRegistry = options.validatorRegistry ?? createValidatorRegistry();
  for (const [id, factory] of options.validatorRegistrations ?? []) {
    validatorRegistry.register(id, factory);
  }
  // HTML/CSS本体はEditableExercisePageのlazy chunk内で同じRegistryへ登録する。
  const editorLanguageRegistry = options.editorLanguageRegistry ?? new EditorLanguageRegistry();
  for (const [id, factory] of options.editorRegistrations ?? []) {
    editorLanguageRegistry.register(id, factory);
  }
  const courseMigrations = new Map<string, Promise<void>>();
  const registeredCourses = new Map<string, CourseManifest>();
  const courseIndexMigrations = new Map<string, Promise<readonly ContentMigrationNotice[]>>();
  const registeredCourseIndexes = new Map<string, CourseIndex>();
  const courseProgressMutations = new Map<string, Promise<void>>();
  let openPromise: Promise<void> | undefined;
  let transferCatalogPromise: Promise<void> | undefined;

  /** open失敗をcacheから除き、画面とRouterの再試行を実効化する。 */
  function ready(): Promise<void> {
    if (openPromise !== undefined) return openPromise;
    const pending = repository.open();
    const guarded = pending.catch((error: unknown) => {
      if (openPromise === guarded) openPromise = undefined;
      throw error;
    });
    openPromise = guarded;
    return guarded;
  }

  /** Course IDとrevision単位でmigrationをsingle-flight・成功cacheする。 */
  function ensureCourse(course: CourseManifest): Promise<void> {
    registeredCourses.set(course.id, course);
    const key = JSON.stringify([course.id, course.revision]);
    const current = courseMigrations.get(key);
    if (current !== undefined) return current;

    contentMigrations.registerCourse(course);
    const operation = (async () => {
      await ready();
      const migrationNotices = await contentMigrations.ensureStoredCourse(course);
      notices.addMigrationNotices(migrationNotices);
    })();
    const guarded = operation.catch((error: unknown) => {
      if (courseMigrations.get(key) === guarded) courseMigrations.delete(key);
      throw error;
    });
    courseMigrations.set(key, guarded);
    return guarded;
  }

  /** Course Indexをmigrationへsingle-flight登録し、発生したnoticeを保持して返す。 */
  function ensureCourseIndex(index: CourseIndex): Promise<readonly ContentMigrationNotice[]> {
    registeredCourseIndexes.set(index.id, index);
    const key = JSON.stringify([index.id, index.revision]);
    const current = courseIndexMigrations.get(key);
    if (current !== undefined) return current;

    contentMigrations.registerCourseDescriptor(index);
    const operation = (async () => {
      await ready();
      const migrationNotices = await contentMigrations.ensureStoredCourseDescriptor(index);
      notices.addMigrationNotices(migrationNotices);
      return migrationNotices;
    })();
    const guarded = operation.catch((error: unknown) => {
      if (courseIndexMigrations.get(key) === guarded) courseIndexMigrations.delete(key);
      throw error;
    });
    courseIndexMigrations.set(key, guarded);
    return guarded;
  }

  /** Import検証前にCatalogの全Manifestをsingle-flightで登録し、失敗後は再試行可能にする。 */
  function prepareTransferCatalog(): Promise<void> {
    if (transferCatalogPromise !== undefined) return transferCatalogPromise;
    const pending = loadTransferCourses().then((courses) => {
      for (const course of courses) {
        registeredCourses.set(course.id, course);
        contentMigrations.registerCourse(course);
      }
    });
    const guarded = pending.catch((error: unknown) => {
      if (transferCatalogPromise === guarded) transferCatalogPromise = undefined;
      throw error;
    });
    transferCatalogPromise = guarded;
    return guarded;
  }

  /** Repository recovery後に既知Courseのmigration成功cacheを破棄して順番に再評価する。 */
  async function recheckRegisteredCourses(): Promise<void> {
    courseMigrations.clear();
    courseIndexMigrations.clear();
    for (const course of registeredCourses.values()) {
      await ensureCourse(course);
    }
    for (const index of registeredCourseIndexes.values()) {
      await ensureCourseIndex(index);
    }
  }

  /** durable領域を再試行し、安全復旧時だけ既知Course migrationを再評価する。 */
  async function retryPersistence(): Promise<PersistenceRetryResult> {
    const result = await progressService.retry();
    if (result.kind === 'recovered') await recheckRegisteredCourses();
    return result;
  }

  /** 利用者が選んだ競合解決を適用し、解決後の教材migrationを再評価する。 */
  async function resolvePersistenceConflict(
    resolution: PersistenceConflictResolution,
  ): Promise<void> {
    await progressService.resolveConflict(resolution);
    await recheckRegisteredCourses();
  }

  /** 同一Courseのread-modify-writeを直列化し、失敗後も後続Mutationを実行可能に保つ。 */
  function runCourseProgressMutation<Result>(
    courseId: string,
    mutation: () => Promise<Result>,
  ): Promise<Result> {
    const previous = courseProgressMutations.get(courseId) ?? Promise.resolve();
    const result = previous.then(async () => {
      const maximumAttempts = 3;
      for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        try {
          return await mutation();
        } catch (error: unknown) {
          if (
            !(error instanceof CourseProgressVersionConflictError) ||
            attempt === maximumAttempts
          ) {
            throw error;
          }
        }
      }
      throw new Error('CourseProgress mutation retryが上限を超えました');
    });
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    courseProgressMutations.set(courseId, settled);
    void settled.then(() => {
      if (courseProgressMutations.get(courseId) === settled) {
        courseProgressMutations.delete(courseId);
      }
    });
    return result;
  }

  return {
    repository,
    progressService,
    passFreshness,
    contentMigrations,
    transferService,
    leaseCoordinator,
    notices,
    runnerRegistry,
    readOnlyPreviewRegistry,
    validatorRegistry,
    editorLanguageRegistry,
    get ready() {
      return ready();
    },
    prepareTransferCatalog,
    retryPersistence,
    resolvePersistenceConflict,
    ensureCourse,
    ensureCourseIndex,
    runCourseProgressMutation,
  };
}

export const learningRuntimeServices = createLearningRuntimeServices();
