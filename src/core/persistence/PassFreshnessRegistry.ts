/** autosave前の編集を同期的に保持し、古い合格画面への遷移を防ぐ。 */

const STORAGE_KEY = 'tsumucode-pass-freshness:v1';
const CHANNEL_NAME = 'tsumucode-pass-freshness';
const MAX_ID_LENGTH = 256;
const MAX_EXERCISES_PER_MESSAGE = 256;

export interface PassFreshnessRegistryOptions {
  readonly storage?: Storage;
  readonly channelFactory?: (name: string) => BroadcastChannel;
}

interface FreshnessMessage {
  readonly version: 1;
  readonly type: 'dirty' | 'passed';
  readonly courseId: string;
  readonly workspaceId: string;
  readonly exerciseIds: readonly string[];
  readonly revision: number;
}

interface StoredFreshness {
  readonly version: 1;
  readonly entries: readonly {
    readonly courseId: string;
    readonly workspaceId: string;
    readonly exerciseId: string;
    readonly revision: number;
  }[];
}

/** same-origin Storage取得時のSecurityErrorを学習画面へ伝播させない。 */
function defaultStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** BroadcastChannel非対応・constructor失敗をmemory fallbackへ変換する。 */
function defaultChannelFactory(): ((name: string) => BroadcastChannel) | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  return (name) => new BroadcastChannel(name);
}

/** 外部message/storageに利用できるbounded IDか検証する。 */
function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ID_LENGTH;
}

/** 編集revisionを有限な非負整数へ限定する。 */
function isValidRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** objectが指定したown keyだけを持つか確認する。 */
function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

/** version 1のchannel messageを余剰propertyを含めて厳格に検証する。 */
function isFreshnessMessage(value: unknown): value is FreshnessMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (
    !hasExactKeys(value, ['courseId', 'exerciseIds', 'revision', 'type', 'version', 'workspaceId'])
  ) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const exerciseIds = record.exerciseIds;
  return (
    record.version === 1 &&
    (record.type === 'dirty' || record.type === 'passed') &&
    isValidId(record.courseId) &&
    isValidId(record.workspaceId) &&
    Array.isArray(exerciseIds) &&
    exerciseIds.length > 0 &&
    exerciseIds.length <= MAX_EXERCISES_PER_MESSAGE &&
    exerciseIds.every(isValidId) &&
    new Set(exerciseIds).size === exerciseIds.length &&
    isValidRevision(record.revision)
  );
}

/** storage entryのstrict shapeを検証する。 */
function isStoredFreshness(value: unknown): value is StoredFreshness {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (!hasExactKeys(value, ['entries', 'version'])) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.entries)) return false;
  if (record.entries.length > 4096) return false;
  return record.entries.every((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    if (!hasExactKeys(entry, ['courseId', 'exerciseId', 'revision', 'workspaceId'])) return false;
    const item = entry as Record<string, unknown>;
    return (
      isValidId(item.courseId) &&
      isValidId(item.workspaceId) &&
      isValidId(item.exerciseId) &&
      isValidRevision(item.revision)
    );
  });
}

/** JSON delimiter衝突を避けて3 IDのmemory keyを作る。 */
function freshnessKey(courseId: string, workspaceId: string, exerciseId: string): string {
  return JSON.stringify([courseId, workspaceId, exerciseId]);
}

/** 公開methodへ渡されたID・revisionをchannel境界と同じ規則で検証する。 */
function assertInput(
  courseId: string,
  workspaceId: string,
  exerciseIds: readonly string[],
  revision: number,
): void {
  if (!isValidId(courseId) || !isValidId(workspaceId)) {
    throw new Error('Course IDとworkspace IDは空でないbounded文字列が必要です');
  }
  if (
    exerciseIds.length === 0 ||
    exerciseIds.length > MAX_EXERCISES_PER_MESSAGE ||
    !exerciseIds.every(isValidId) ||
    new Set(exerciseIds).size !== exerciseIds.length
  ) {
    throw new Error('Exercise IDは重複のない空でないbounded配列が必要です');
  }
  if (!isValidRevision(revision)) {
    throw new Error('revisionは有限な非負整数が必要です');
  }
}

/** Course・workspace・Exercise別の短命dirty markerをStorageとtab間へ同期する。 */
export class PassFreshnessRegistry {
  readonly #dirty = new Map<string, StoredFreshness['entries'][number]>();
  readonly #storage: Storage | undefined;
  readonly #channel: BroadcastChannel | undefined;
  #disposed = false;

  constructor(options: PassFreshnessRegistryOptions = {}) {
    this.#storage = options.storage ?? defaultStorage();
    this.#restore();
    const factory = options.channelFactory ?? defaultChannelFactory();
    try {
      this.#channel = factory?.(CHANNEL_NAME);
      if (this.#channel !== undefined) {
        this.#channel.onmessage = (event: MessageEvent<unknown>): void => {
          if (!this.#disposed) this.#receive(event.data);
        };
      }
    } catch {
      this.#channel = undefined;
    }
  }

  /** sessionStorageのstrict version 1 stateをmemoryへ復元する。 */
  #restore(): void {
    try {
      const raw = this.#storage?.getItem(STORAGE_KEY);
      if (raw === undefined || raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredFreshness(parsed)) return;
      for (const entry of parsed.entries) {
        this.#dirty.set(freshnessKey(entry.courseId, entry.workspaceId, entry.exerciseId), {
          ...entry,
        });
      }
    } catch {
      // Storage／JSON失敗時も同期memory markerを利用できる状態で継続する。
    }
  }

  /** 現在memory stateをStorageへbest-effortで保存する。 */
  #persist(): void {
    const stored: StoredFreshness = {
      version: 1,
      entries: [...this.#dirty.values()].map((entry) => ({ ...entry })),
    };
    try {
      this.#storage?.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // memory markerを正として継続する。
    }
  }

  /** channel payloadを検証後にmemory/storageへ反映する。 */
  #receive(value: unknown): void {
    if (!isFreshnessMessage(value)) return;
    this.#apply(value);
    this.#persist();
  }

  /** dirty/pass messageをrevision条件付きでmemoryへ適用する。 */
  #apply(message: FreshnessMessage): void {
    for (const exerciseId of message.exerciseIds) {
      const key = freshnessKey(message.courseId, message.workspaceId, exerciseId);
      const current = this.#dirty.get(key);
      if (message.type === 'dirty') {
        if (current === undefined || message.revision >= current.revision) {
          this.#dirty.set(key, {
            courseId: message.courseId,
            workspaceId: message.workspaceId,
            exerciseId,
            revision: message.revision,
          });
        }
      } else if (current?.revision === message.revision) {
        this.#dirty.delete(key);
      }
    }
  }

  /** messageをmemory/storageへ同期適用してから別tabへbest-effort配信する。 */
  #publish(message: FreshnessMessage): void {
    if (this.#disposed) throw new Error('PassFreshnessRegistry is disposed');
    this.#apply(message);
    this.#persist();
    try {
      this.#channel?.postMessage(message);
    } catch {
      // Channel失敗時も同一tabのguardは維持する。
    }
  }

  /** 共有workspaceの全Exerciseを編集callbackと同じ同期turnでdirtyにする。 */
  markDirty(
    courseId: string,
    workspaceId: string,
    exerciseIds: readonly string[],
    revision: number,
  ): void {
    assertInput(courseId, workspaceId, exerciseIds, revision);
    this.#publish({ version: 1, type: 'dirty', courseId, workspaceId, exerciseIds, revision });
  }

  /** 同じrevisionで原子的保存が済んだExerciseだけのdirty markerを消す。 */
  markPassed(
    courseId: string,
    workspaceId: string,
    exerciseIds: readonly string[],
    revision: number,
  ): void {
    assertInput(courseId, workspaceId, exerciseIds, revision);
    this.#publish({ version: 1, type: 'passed', courseId, workspaceId, exerciseIds, revision });
  }

  /** 指定Exerciseに未再判定の同期dirty markerが残っているか返す。 */
  isDirty(courseId: string, workspaceId: string, exerciseId: string): boolean {
    if (!isValidId(courseId) || !isValidId(workspaceId) || !isValidId(exerciseId)) return true;
    return this.#dirty.has(freshnessKey(courseId, workspaceId, exerciseId));
  }

  /** channel listenerと接続を冪等に解放し、以後の外部messageを受信しない。 */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#channel !== undefined) {
      this.#channel.onmessage = null;
      try {
        this.#channel.close();
      } catch {
        // 解放失敗は呼出側の学習状態へ影響させない。
      }
    }
  }
}
