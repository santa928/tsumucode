/** routeを越えて保持する教材移行・端末保存Notice store。 */
import type { ContentMigrationNotice } from '../../core/persistence/contentProgressMigration';

const STORAGE_KEY = 'tsumucode-runtime-notices:v1';
const MAX_NOTICE_ID_LENGTH = 512;
const GENERIC_STORAGE_ERROR = '端末への進捗保存に失敗しました。もう一度操作してください。';

/** error scopeを内部詳細を含まない操作別の案内へ変換する。 */
function errorMessage(scope: string): string {
  switch (scope) {
    case 'exercise-preview':
      return 'プレビューの自動更新に失敗しました。手動の更新をもう一度試してください。';
    case 'exercise-initialize':
      return '端末の学習データを読み込めませんでした。演習画面からもう一度試してください。';
    default:
      return GENERIC_STORAGE_ERROR;
  }
}

export interface RuntimeNotice {
  readonly id: string;
  readonly kind: 'migration' | 'error';
  readonly message: string;
}

export interface RuntimeNoticeStoreOptions {
  readonly storage?: Storage;
  readonly isPersistenceDegraded?: () => boolean;
}

interface StoredNotices {
  readonly version: 1;
  readonly notices: readonly RuntimeNotice[];
}

/** sessionStorage getter自体のSecurityErrorをmemory fallbackへ変換する。 */
function defaultStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Notice IDを保存・DOM keyに利用できるbounded文字列へ限定する。 */
function isValidNoticeId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_NOTICE_ID_LENGTH
  );
}

/** 保存された公開Noticeだけをstrict shapeで復元する。 */
function isStoredNotices(value: unknown): value is StoredNotices {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'notices,version' ||
    record.version !== 1 ||
    !Array.isArray(record.notices) ||
    record.notices.length > 100
  ) {
    return false;
  }
  return record.notices.every((notice: unknown) => {
    if (typeof notice !== 'object' || notice === null || Array.isArray(notice)) return false;
    const item = notice as Record<string, unknown>;
    return (
      Object.keys(item).sort().join(',') === 'id,kind,message' &&
      isValidNoticeId(item.id) &&
      (item.kind === 'migration' || item.kind === 'error') &&
      typeof item.message === 'string' &&
      item.message.length > 0 &&
      item.message.length <= 512
    );
  });
}

/** Content移行通知とbackground失敗をsession queueとして購読可能に保持する。 */
export class RuntimeNoticeStore {
  readonly #listeners = new Set<() => void>();
  readonly #storage: Storage | undefined;
  readonly #isPersistenceDegraded: () => boolean;
  #snapshot: readonly RuntimeNotice[] = [];

  constructor(options: RuntimeNoticeStoreOptions = {}) {
    this.#storage = options.storage ?? defaultStorage();
    this.#isPersistenceDegraded = options.isPersistenceDegraded ?? (() => false);
    try {
      const raw = this.#storage?.getItem(STORAGE_KEY);
      if (raw === undefined || raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (isStoredNotices(parsed)) {
        const seen = new Set<string>();
        this.#snapshot = parsed.notices.filter(({ id }) => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }
    } catch {
      // 壊れた値やStorage拒否を無視し、memory queueで継続する。
    }
  }

  /** useSyncExternalStore向けの参照安定snapshotを返す。 */
  readonly getSnapshot = (): readonly RuntimeNotice[] => this.#snapshot;

  /** Notice変更listenerを購読し、冪等な解除関数を返す。 */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(listener);
    };
  };

  /** snapshotを差し替え、Storage保存後に全listenerへ通知する。 */
  #publish(next: readonly RuntimeNotice[]): void {
    this.#snapshot = next;
    const stored: StoredNotices = { version: 1, notices: next };
    try {
      this.#storage?.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // memory queueは維持する。
    }
    for (const listener of [...this.#listeners]) listener();
  }

  /** Course単位へ集約し、教材resetの件数・内部理由を公開せず安全な定型文へ変換する。 */
  addMigrationNotices(notices: readonly ContentMigrationNotice[]): void {
    const byId = new Map(this.#snapshot.map((notice) => [notice.id, notice]));
    for (const { courseId } of notices) {
      if (!isValidNoticeId(courseId)) continue;
      const id = `migration:${courseId}`;
      if (!isValidNoticeId(id) || byId.has(id) || byId.size >= 100) continue;
      byId.set(id, {
        id,
        kind: 'migration',
        message: '教材の更新に合わせて、一部の進捗を安全に初期化しました。',
      });
    }
    const next = [...byId.values()];
    if (next.length !== this.#snapshot.length) this.#publish(next);
  }

  /** Error詳細を公開せず、領域ごとに一つの再試行可能な常設警告へ変換する。 */
  reportError(scope: string, error: unknown): void {
    void error;
    const candidateScope =
      isValidNoticeId(scope) && /^[a-z0-9-]+$/u.test(scope) ? scope : 'learning-progress';
    const safeScope =
      `error:${candidateScope}`.length <= MAX_NOTICE_ID_LENGTH
        ? candidateScope
        : 'learning-progress';
    const persistenceError =
      safeScope === 'exercise-save' ||
      safeScope === 'exercise-initialize' ||
      safeScope === 'slide-progress' ||
      safeScope === 'learning-progress';
    if (persistenceError && this.#isPersistenceDegraded()) return;
    const id = `error:${safeScope}`;
    if (this.#snapshot.some((notice) => notice.id === id)) return;
    let retained = this.#snapshot;
    if (retained.length >= 100) {
      const migrationIndex = retained.findIndex(({ kind }) => kind === 'migration');
      const evictionIndex = migrationIndex >= 0 ? migrationIndex : 0;
      retained = retained.filter((_notice, index) => index !== evictionIndex);
    }
    this.#publish([
      ...retained,
      {
        id,
        kind: 'error',
        message: errorMessage(safeScope),
      },
    ]);
  }

  /** 明示されたNoticeだけをqueueとStorageから除去する。 */
  dismiss(id: string): void {
    const next = this.#snapshot.filter((notice) => notice.id !== id);
    if (next.length !== this.#snapshot.length) this.#publish(next);
  }
}
