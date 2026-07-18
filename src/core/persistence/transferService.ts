/** 全Course進捗のexport、検証、差分preview、backup-first importを調停する。 */
import { migrateRepositorySnapshot } from '../../adapters/persistence/indexeddb/migrateProgress';
import { canonicalJson, sha256 } from './canonicalJson';
import type {
  ContentMigrationResetNotice,
  ContentProgressMigrationService,
} from './contentProgressMigration';
import type {
  CourseProgress,
  ExerciseDraft,
  ProgressBundle,
  ProgressRepository,
  RepositorySnapshot,
} from './contracts';

export interface ImportDifference {
  readonly courseId: string;
  readonly kind: 'add' | 'replace' | 'remove';
  readonly completedLessons: number;
  readonly updatedAt: string;
}

export interface ImportPreview {
  readonly id: string;
  readonly exportedAt: string;
  readonly differences: readonly ImportDifference[];
  readonly resetNotices: readonly ContentMigrationResetNotice[];
}

/** 進捗移行実装を遅延化・注入できる公開操作契約。 */
export interface TransferServicePort {
  exportAll(): Promise<string>;
  prepareImport(raw: string): Promise<ImportPreview>;
  discardImport(previewId: string): boolean;
  applyImport(previewId: string): Promise<void>;
}

interface PreparedImport extends ImportPreview {
  readonly snapshot: RepositorySnapshot;
}

interface TransferOptions {
  readonly appVersion: string;
  readonly now: () => string;
  readonly id?: () => string;
}

interface EmergencySnapshotProvider {
  emergencySnapshot(): Promise<RepositorySnapshot>;
}

/** Repositoryが正本と分離した緊急Export snapshotを提供するか安全に判定する。 */
function hasEmergencySnapshot(
  repository: ProgressRepository,
): repository is ProgressRepository & EmergencySnapshotProvider {
  const candidate: unknown = Reflect.get(repository, 'emergencySnapshot');
  return typeof candidate === 'function';
}

interface CourseTransferState {
  readonly course?: CourseProgress;
  readonly drafts: Readonly<Record<string, ExerciseDraft>>;
}

const REQUIRED_BUNDLE_KEYS = [
  'appVersion',
  'courses',
  'drafts',
  'exportedAt',
  'integrity',
  'schemaVersion',
] as const;
const ALLOWED_BUNDLE_KEYS = new Set<string>([...REQUIRED_BUNDLE_KEYS, 'quarantined']);

/** 値がarray以外のobjectかを判定する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** bundle top-levelの不足・余剰keyとintegrity形式をmutation前に検証する。 */
function splitBundle(value: unknown): {
  readonly unsigned: Record<string, unknown>;
  readonly integrity: ProgressBundle['integrity'];
} {
  if (!isRecord(value)) throw new Error('TsumuCodeの進捗bundleではありません');
  const keys = Object.keys(value);
  if (
    REQUIRED_BUNDLE_KEYS.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !ALLOWED_BUNDLE_KEYS.has(key))
  ) {
    throw new Error('進捗bundleのmetadataが不正です');
  }
  const integrity = value.integrity;
  if (
    !isRecord(integrity) ||
    Object.keys(integrity).sort().join(',') !== 'algorithm,digest' ||
    integrity.algorithm !== 'SHA-256' ||
    typeof integrity.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.digest)
  ) {
    throw new Error('整合確認hashが不正です');
  }
  const unsigned = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'integrity'));
  return {
    unsigned,
    integrity: { algorithm: 'SHA-256', digest: integrity.digest },
  };
}

/** hash検証後のappVersionとexport日時を厳密検証する。 */
function assertMetadata(unsigned: Readonly<Record<string, unknown>>): asserts unsigned is {
  readonly appVersion: string;
  readonly exportedAt: string;
} & Readonly<Record<string, unknown>> {
  if (
    typeof unsigned.appVersion !== 'string' ||
    unsigned.appVersion.length === 0 ||
    typeof unsigned.exportedAt !== 'string' ||
    unsigned.exportedAt.length === 0 ||
    !Number.isFinite(Date.parse(unsigned.exportedAt))
  ) {
    throw new Error('進捗bundleのmetadataが不正です');
  }
}

/** 指定CourseのProgressとDraft集合をcanonical比較できる単位へ集約する。 */
function courseState(snapshot: RepositorySnapshot, courseId: string): CourseTransferState {
  return {
    ...(snapshot.courses[courseId] === undefined ? {} : { course: snapshot.courses[courseId] }),
    drafts: Object.fromEntries(
      Object.entries(snapshot.drafts)
        .filter(([, draft]) => draft.courseId === courseId)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

/** Course単位の表示要約をCourseまたは最新Draftから生成する。 */
function summarizeState(state: CourseTransferState, fallbackTime: string) {
  const completedLessons = state.course
    ? Object.values(state.course.lessons).filter(({ currentComplete }) => currentComplete).length
    : 0;
  const updatedAt = [
    state.course?.updatedAt,
    ...Object.values(state.drafts).map((draft) => draft.updatedAt),
  ]
    .filter((value): value is string => value !== undefined)
    .sort()
    .at(-1);
  return { completedLessons, updatedAt: updatedAt ?? fallbackTime };
}

/** current/incomingのCourseとDraftを比較し、add/replace/remove差分を返す。 */
function buildDifferences(
  current: RepositorySnapshot,
  incoming: RepositorySnapshot,
  exportedAt: string,
): readonly ImportDifference[] {
  const ids = new Set([
    ...Object.keys(current.courses),
    ...Object.values(current.drafts).map(({ courseId }) => courseId),
    ...Object.keys(incoming.courses),
    ...Object.values(incoming.drafts).map(({ courseId }) => courseId),
  ]);
  return [...ids].sort().flatMap((courseId) => {
    const existing = courseState(current, courseId);
    const next = courseState(incoming, courseId);
    if (canonicalJson(existing) === canonicalJson(next)) return [];
    const existingPresent =
      existing.course !== undefined || Object.keys(existing.drafts).length > 0;
    const nextPresent = next.course !== undefined || Object.keys(next.drafts).length > 0;
    const kind = !existingPresent ? 'add' : !nextPresent ? 'remove' : 'replace';
    return [
      {
        courseId,
        kind,
        ...summarizeState(nextPresent ? next : existing, exportedAt),
      },
    ];
  });
}

/** Export、検証、差分確認、backup、transactional replace、rollbackを調停する。 */
export class TransferService implements TransferServicePort {
  readonly #prepared = new Map<string, PreparedImport>();
  readonly #applying = new Set<string>();
  readonly #id: () => string;

  /** Repository、教材migration、version・時刻・ID依存を保持する。 */
  constructor(
    private readonly repository: ProgressRepository,
    private readonly migrations: ContentProgressMigrationService,
    private readonly options: TransferOptions,
  ) {
    this.#id = options.id ?? (() => crypto.randomUUID());
  }

  /** Repository全体をversioned bundle化し、canonical SHA-256を付けて返す。 */
  async exportAll(): Promise<string> {
    const snapshot = hasEmergencySnapshot(this.repository)
      ? await this.repository.emergencySnapshot()
      : await this.repository.snapshot();
    const unsigned = {
      ...snapshot,
      appVersion: this.options.appVersion,
      exportedAt: this.options.now(),
    };
    const digest = await sha256(canonicalJson(unsigned));
    const bundle: ProgressBundle = {
      ...unsigned,
      integrity: { algorithm: 'SHA-256', digest },
    };
    return JSON.stringify(bundle, null, 2);
  }

  /** raw bundleをhash・schema・教材revisionまで検証し、mutationなしで差分を準備する。 */
  async prepareImport(raw: string): Promise<ImportPreview> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error('JSONとして読み込めません');
    }
    const { unsigned, integrity } = splitBundle(parsed);
    if ((await sha256(canonicalJson(unsigned))) !== integrity.digest) {
      throw new Error('整合確認hashが一致しません');
    }
    assertMetadata(unsigned);

    const storageMigrated = migrateRepositorySnapshot(unsigned, this.options.now());
    const { snapshot, notices } = await this.migrations.migrateSnapshotWithNotices(
      storageMigrated,
      { requireRegisteredCourses: true },
    );
    const current = await this.repository.snapshot();
    const id = this.#id();
    if (this.#prepared.has(id) || this.#applying.has(id)) {
      throw new Error('Import preview IDが衝突しました');
    }
    const prepared: PreparedImport = {
      id,
      exportedAt: unsigned.exportedAt,
      differences: buildDifferences(current, snapshot, unsigned.exportedAt),
      resetNotices: notices,
      snapshot,
    };
    for (const preparedId of this.#prepared.keys()) {
      if (!this.#applying.has(preparedId)) this.#prepared.delete(preparedId);
    }
    this.#prepared.set(prepared.id, prepared);
    return {
      id: prepared.id,
      exportedAt: prepared.exportedAt,
      differences: prepared.differences,
      resetNotices: prepared.resetNotices,
    };
  }

  /** 確定前のpreviewと内部snapshotを明示的に破棄する。 */
  discardImport(previewId: string): boolean {
    if (this.#applying.has(previewId)) return false;
    return this.#prepared.delete(previewId);
  }

  /** 準備済みpreviewをsingle-flightでbackup-first適用し、成功後は再利用を拒否する。 */
  async applyImport(previewId: string): Promise<void> {
    const prepared = this.#prepared.get(previewId);
    if (prepared === undefined) throw new Error('Import previewの有効期限が切れています');
    if (this.#applying.has(previewId)) throw new Error('Import previewは適用中です');
    this.#applying.add(previewId);
    try {
      await this.repository.replaceSnapshotWithBackup(prepared.snapshot, 'before-import');
      this.#prepared.delete(previewId);
    } finally {
      this.#applying.delete(previewId);
    }
  }
}
