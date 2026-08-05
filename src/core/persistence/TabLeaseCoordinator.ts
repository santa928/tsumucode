/** 同一workspaceの編集権をtab間で調停し、保存処理をlease tokenで囲う。 */

import {
  LeaseFenceRejectedError,
  type ProgressRepository,
  type WorkspaceLeaseProof,
} from './contracts';

const CHANNEL_NAME = 'tsumucode-editing';
const TAB_ID_STORAGE_KEY = 'tsumucode-editing:tab-id:v1';
const MESSAGE_VERSION = 1;
const MAX_ID_LENGTH = 256;
const MAX_LEASE_DURATION_MS = 30_000;
const MAX_CLOCK_SKEW_MS = 60_000;
const MAX_RETIRED_TOKENS = 64;

export type TabLeaseStatus =
  'claiming' | 'owned' | 'local-rescue' | 'read-only' | 'yielding' | 'released';
export type TabLeaseCoordination = 'available' | 'unavailable';

/** UIが購読する参照安定なediting lease snapshot。 */
export interface TabLeaseState {
  readonly status: TabLeaseStatus;
  readonly coordination: TabLeaseCoordination;
  readonly ownerId?: string;
  readonly expiresAt?: number;
}

/** lease取得時に旧ownerが保存をsettleするためのcallback。 */
export interface TabLeaseAcquireOptions {
  readonly beforeYield: (yieldFence: TabLeaseWriteFence) => void | Promise<void>;
}

/** yield lifecycle中だけ旧owner tokenでpending保存を開始できる限定capability。 */
export type TabLeaseWriteFence = <T>(
  operation: (token: string, proof: WorkspaceLeaseProof) => T | Promise<T>,
) => Promise<T>;

/** Coordinatorが所有権正本として使うProgress Repositoryの最小port。 */
export type TabLeasePersistence = Pick<
  ProgressRepository,
  | 'tryClaimWorkspaceLease'
  | 'readWorkspaceLease'
  | 'heartbeatWorkspaceLease'
  | 'releaseWorkspaceLease'
>;

/** WorkspaceLeaseGateと保存処理が利用するlease handle。 */
export interface TabLeaseHandle {
  getSnapshot(): TabLeaseState;
  subscribe(listener: () => void): () => void;
  takeover(): Promise<boolean>;
  runFencedWrite<T>(
    operation: (token: string, proof: WorkspaceLeaseProof) => T | Promise<T>,
  ): Promise<T>;
  release(): Promise<void>;
  dispose(): void;
}

/** Timer・channel・ID発行をBrowser APIから分離する注入点。 */
export interface TabLeaseCoordinatorOptions {
  readonly channelFactory?: ((name: string) => BroadcastChannel) | undefined;
  readonly storage?: Storage | undefined;
  readonly now?: (() => number) | undefined;
  readonly setTimeout?: ((callback: () => void, delay: number) => unknown) | undefined;
  readonly clearTimeout?: ((timer: unknown) => void) | undefined;
  readonly idFactory?: (() => string) | undefined;
  readonly probeDurationMs?: number | undefined;
  readonly arbitrationDurationMs?: number | undefined;
  readonly heartbeatIntervalMs?: number | undefined;
  readonly leaseDurationMs?: number | undefined;
  readonly takeoverTimeoutMs?: number | undefined;
  readonly leasePersistence?: TabLeasePersistence | undefined;
  readonly lifecycleTarget?: EventTarget | undefined;
  readonly isVisible?: (() => boolean) | undefined;
  readonly reuseStoredTabId?: boolean | undefined;
}

interface LeaseOwner {
  readonly ownerId: string;
  readonly token: string;
  readonly dataEpoch: number;
  readonly expiresAt: number;
}

interface ActiveLeaseWrite {
  readonly owner: LeaseOwner;
  readonly status: 'owned' | 'yielding';
}

interface ProbeMessage {
  readonly version: 1;
  readonly type: 'probe';
  readonly courseId: string;
  readonly workspaceId: string;
  readonly senderId: string;
  readonly requestId: string;
  readonly sentAt: number;
}

interface ClaimMessage {
  readonly version: 1;
  readonly type: 'claim';
  readonly courseId: string;
  readonly workspaceId: string;
  readonly senderId: string;
  readonly token: string;
  readonly sentAt: number;
  readonly expiresAt: number;
}

interface HeartbeatMessage {
  readonly version: 1;
  readonly type: 'heartbeat';
  readonly courseId: string;
  readonly workspaceId: string;
  readonly senderId: string;
  readonly token: string;
  readonly sentAt: number;
  readonly expiresAt: number;
}

interface ReleaseMessage {
  readonly version: 1;
  readonly type: 'release';
  readonly courseId: string;
  readonly workspaceId: string;
  readonly senderId: string;
  readonly token: string;
  readonly sentAt: number;
}

interface TakeoverRequestMessage {
  readonly version: 1;
  readonly type: 'takeover-request';
  readonly courseId: string;
  readonly workspaceId: string;
  readonly senderId: string;
  readonly targetOwnerId: string;
  readonly targetToken: string;
  readonly requestId: string;
  readonly sentAt: number;
}

interface YieldAckMessage {
  readonly version: 1;
  readonly type: 'yield-ack';
  readonly courseId: string;
  readonly workspaceId: string;
  readonly senderId: string;
  readonly targetOwnerId: string;
  readonly releasedToken: string;
  readonly requestId: string;
  readonly sentAt: number;
}

type LeaseMessage =
  | ProbeMessage
  | ClaimMessage
  | HeartbeatMessage
  | ReleaseMessage
  | TakeoverRequestMessage
  | YieldAckMessage;

interface LeaseTiming {
  readonly probeDurationMs: number;
  readonly arbitrationDurationMs: number;
  readonly heartbeatIntervalMs: number;
  readonly leaseDurationMs: number;
  readonly takeoverTimeoutMs: number;
}

interface LeaseRuntime {
  readonly tabId: string;
  readonly timing: LeaseTiming;
  now(): number;
  createId(): string;
  schedule(callback: () => void, delay: number): unknown;
  cancel(timer: unknown): void;
  post(message: LeaseMessage): boolean;
  coordinationAvailable(): boolean;
  persistence(): TabLeasePersistence | undefined;
  remove(key: string, handle: LeaseHandleImpl): void;
}

interface PendingTakeover {
  readonly requestId: string;
  readonly targetOwnerId: string;
  readonly targetToken: string;
  readonly newToken: string;
  readonly promise: Promise<boolean>;
  readonly resolve: (acquired: boolean) => void;
  timer: unknown;
}

/** window.sessionStorage取得時のSecurityErrorを外へ漏らさない。 */
function defaultStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** BroadcastChannel非対応時にundefinedを返す。 */
function defaultChannelFactory(): ((name: string) => BroadcastChannel) | undefined {
  return typeof BroadcastChannel === 'undefined' ? undefined : (name) => new BroadcastChannel(name);
}

/** crypto優先でtab・token用のbounded IDを作る。 */
function defaultIdFactory(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // 制限環境では時刻と乱数によるtab内一意IDへfallbackする。
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/** 外部messageと公開入力に許可するbounded IDか検証する。 */
function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ID_LENGTH;
}

/** Unix epoch相当の有限な非負整数か検証する。 */
function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** payloadが期待するown keyだけを持つか検証する。 */
function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

/** claim／heartbeatの期限を上限付きで検証する。 */
function hasValidLeaseWindow(record: Record<string, unknown>, now: number): boolean {
  return (
    isValidTimestamp(record.sentAt) &&
    isValidTimestamp(record.expiresAt) &&
    record.sentAt <= now + MAX_CLOCK_SKEW_MS &&
    record.expiresAt > record.sentAt &&
    record.expiresAt - record.sentAt <= MAX_LEASE_DURATION_MS
  );
}

/** BroadcastChannelから届いたversion 1 payloadを余剰property込みで厳格検証する。 */
function parseLeaseMessage(value: unknown, now: number): LeaseMessage | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.version !== MESSAGE_VERSION ||
    !isValidId(record.type) ||
    !isValidId(record.courseId) ||
    !isValidId(record.workspaceId) ||
    !isValidId(record.senderId) ||
    !isValidTimestamp(record.sentAt) ||
    record.sentAt > now + MAX_CLOCK_SKEW_MS
  ) {
    return undefined;
  }
  switch (record.type) {
    case 'probe':
      return hasExactKeys(record, [
        'version',
        'type',
        'courseId',
        'workspaceId',
        'senderId',
        'requestId',
        'sentAt',
      ]) && isValidId(record.requestId)
        ? (record as unknown as ProbeMessage)
        : undefined;
    case 'claim':
    case 'heartbeat':
      return hasExactKeys(record, [
        'version',
        'type',
        'courseId',
        'workspaceId',
        'senderId',
        'token',
        'sentAt',
        'expiresAt',
      ]) &&
        isValidId(record.token) &&
        hasValidLeaseWindow(record, now)
        ? (record as unknown as ClaimMessage | HeartbeatMessage)
        : undefined;
    case 'release':
      return hasExactKeys(record, [
        'version',
        'type',
        'courseId',
        'workspaceId',
        'senderId',
        'token',
        'sentAt',
      ]) && isValidId(record.token)
        ? (record as unknown as ReleaseMessage)
        : undefined;
    case 'takeover-request':
      return hasExactKeys(record, [
        'version',
        'type',
        'courseId',
        'workspaceId',
        'senderId',
        'targetOwnerId',
        'targetToken',
        'requestId',
        'sentAt',
      ]) &&
        isValidId(record.targetOwnerId) &&
        isValidId(record.targetToken) &&
        isValidId(record.requestId)
        ? (record as unknown as TakeoverRequestMessage)
        : undefined;
    case 'yield-ack':
      return hasExactKeys(record, [
        'version',
        'type',
        'courseId',
        'workspaceId',
        'senderId',
        'targetOwnerId',
        'releasedToken',
        'requestId',
        'sentAt',
      ]) &&
        isValidId(record.targetOwnerId) &&
        isValidId(record.releasedToken) &&
        isValidId(record.requestId)
        ? (record as unknown as YieldAckMessage)
        : undefined;
    default:
      return undefined;
  }
}

/** courseIdとworkspaceIdをdelimiter衝突のないMap keyへ変換する。 */
function workspaceKey(courseId: string, workspaceId: string): string {
  return JSON.stringify([courseId, workspaceId]);
}

/** timing optionを有限な正整数かつ安全上限内へ限定する。 */
function timingValue(value: number | undefined, fallback: number, maximum: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new Error('Lease timingは安全上限内の正整数が必要です');
  }
  return resolved;
}

/** Navigation Timingが明示するreloadだけ、直前documentのtab ID引継ぎ対象にする。 */
function defaultReuseStoredTabId(): boolean {
  try {
    if (typeof performance === 'undefined') return false;
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    return navigation?.type === 'reload';
  } catch {
    return false;
  }
}

/** 通常navigationはclone値を拒否し、reloadだけ同じtab IDをbest-effortで再利用する。 */
function resolveTabId(
  storage: Storage | undefined,
  createId: () => string,
  reuseStoredTabId: boolean,
): string {
  if (reuseStoredTabId) {
    try {
      const stored = storage?.getItem(TAB_ID_STORAGE_KEY);
      if (isValidId(stored)) return stored;
    } catch {
      // 読み出せない環境ではinstance固有IDへfallbackする。
    }
  }
  const created = createId();
  if (!isValidId(created)) throw new Error('idFactoryは空でないbounded文字列を返す必要があります');
  try {
    storage?.setItem(TAB_ID_STORAGE_KEY, created);
  } catch {
    // memory IDを正として継続する。
  }
  return created;
}

/** tie-breakで比較するownerId・token pairを辞書順へ並べる。 */
function compareOwners(left: LeaseOwner, right: LeaseOwner): number {
  const ownerOrder = left.ownerId === right.ownerId ? 0 : left.ownerId < right.ownerId ? -1 : 1;
  if (ownerOrder !== 0) return ownerOrder;
  return left.token === right.token ? 0 : left.token < right.token ? -1 : 1;
}

/** handleごとのprobe／heartbeat／takeover／write fencingを管理する。 */
class LeaseHandleImpl implements TabLeaseHandle {
  readonly #courseId: string;
  readonly #workspaceId: string;
  readonly #key: string;
  readonly #beforeYield: (yieldFence: TabLeaseWriteFence) => void | Promise<void>;
  readonly #runtime: LeaseRuntime;
  readonly #listeners = new Set<() => void>();
  readonly #inFlightWrites = new Set<Promise<unknown>>();
  readonly #retiredTokens = new Set<string>();
  #persistedWriteTail: Promise<void> = Promise.resolve();
  #snapshot: TabLeaseState;
  #owner: LeaseOwner | undefined;
  #candidate: LeaseOwner | undefined;
  #bestCandidate: LeaseOwner | undefined;
  #observedOwner: LeaseOwner | undefined;
  #probeTimer: unknown;
  #arbitrationTimer: unknown;
  #heartbeatTimer: unknown;
  #heartbeatInFlight: Promise<void> | undefined;
  #revalidationInFlight: Promise<void> | undefined;
  #revalidationRequested = false;
  #expiryTimer: unknown;
  #pendingTakeover: PendingTakeover | undefined;
  #yieldGeneration = 0;
  #persistenceGeneration = 0;
  #boundDataEpoch: number | undefined;
  #disposed = false;

  constructor(
    courseId: string,
    workspaceId: string,
    options: TabLeaseAcquireOptions,
    runtime: LeaseRuntime,
  ) {
    this.#courseId = courseId;
    this.#workspaceId = workspaceId;
    this.#key = workspaceKey(courseId, workspaceId);
    this.#beforeYield = options.beforeYield;
    this.#runtime = runtime;
    const requiresClaim = runtime.coordinationAvailable() || runtime.persistence() !== undefined;
    this.#snapshot = Object.freeze({
      status: requiresClaim ? 'claiming' : 'owned',
      coordination: runtime.coordinationAvailable() ? 'available' : 'unavailable',
    });
  }

  /** coordinator登録後にprobe handshakeまたは単一tab fallbackを開始する。 */
  start(): void {
    if (this.#runtime.coordinationAvailable() || this.#runtime.persistence() !== undefined)
      this.#beginClaim();
    else this.activateFallback();
  }

  /** 現在snapshotを同一state中は同じ参照で返す。 */
  getSnapshot(): TabLeaseState {
    return this.#snapshot;
  }

  /** state変更通知を購読しcleanup関数を返す。 */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** read-only ownerへtargeted takeoverを依頼しyield ackを待つ。 */
  takeover(): Promise<boolean> {
    if (this.#disposed) return Promise.resolve(false);
    if (this.#snapshot.status === 'owned') return Promise.resolve(true);
    if (!this.#runtime.coordinationAvailable() && this.#runtime.persistence() === undefined) {
      this.activateFallback();
      return Promise.resolve(true);
    }
    if (this.#pendingTakeover !== undefined) return this.#pendingTakeover.promise;
    if (this.#snapshot.status !== 'read-only' || this.#owner === undefined) {
      return Promise.resolve(false);
    }
    const target = this.#owner;
    const requestId = this.#runtime.createId();
    const newToken = this.#runtime.createId();
    let resolve!: (acquired: boolean) => void;
    const promise = new Promise<boolean>((accept) => {
      resolve = accept;
    });
    const pending: PendingTakeover = {
      requestId,
      targetOwnerId: target.ownerId,
      targetToken: target.token,
      newToken,
      promise,
      resolve,
      timer: undefined,
    };
    pending.timer = this.#runtime.schedule(() => {
      if (this.#pendingTakeover !== pending) return;
      if (this.#runtime.persistence() !== undefined) {
        void this.#completePersistentTakeover(pending);
        return;
      }
      this.#pendingTakeover = undefined;
      pending.resolve(false);
      if (this.#owner !== undefined && this.#owner.expiresAt <= this.#runtime.now()) {
        this.#beginClaim();
      }
    }, this.#runtime.timing.takeoverTimeoutMs);
    this.#pendingTakeover = pending;
    const posted = this.#runtime.post({
      version: MESSAGE_VERSION,
      type: 'takeover-request',
      courseId: this.#courseId,
      workspaceId: this.#workspaceId,
      senderId: this.#runtime.tabId,
      targetOwnerId: target.ownerId,
      targetToken: target.token,
      requestId,
      sentAt: this.#runtime.now(),
    });
    if (!posted && this.#pendingTakeover === pending) {
      if (this.#runtime.persistence() !== undefined) {
        void this.#completePersistentTakeover(pending);
      } else {
        this.#runtime.cancel(pending.timer);
        this.#pendingTakeover = undefined;
        pending.resolve(true);
      }
    }
    return promise;
  }

  /** owned tokenをcallbackへ渡し、yield中・release後の新規writeを開始前に拒否する。 */
  runFencedWrite<T>(
    operation: (token: string, proof: WorkspaceLeaseProof) => T | Promise<T>,
  ): Promise<T> {
    if (
      (this.#snapshot.status !== 'owned' && this.#snapshot.status !== 'local-rescue') ||
      this.#owner?.ownerId !== this.#runtime.tabId
    ) {
      return Promise.reject(new Error('このタブはworkspaceの編集権を保持していません'));
    }
    return this.#startFencedWrite(operation, this.#owner);
  }

  /** 検証済みtokenのwriteをreentrant takeoverより先にin-flight登録して開始する。 */
  #startFencedWrite<T>(
    operation: (token: string, proof: WorkspaceLeaseProof) => T | Promise<T>,
    owner: LeaseOwner,
  ): Promise<T> {
    let settleFence!: () => void;
    const inFlightFence = new Promise<void>((resolve) => {
      settleFence = resolve;
    });
    this.#inFlightWrites.add(inFlightFence);
    let result: Promise<T>;
    try {
      result =
        this.#runtime.persistence() !== undefined &&
        this.#boundDataEpoch !== undefined &&
        this.#snapshot.status !== 'local-rescue'
          ? this.#runPersistedFencedWrite(operation, owner.token)
          : Promise.resolve(operation(owner.token, this.#proof(owner)));
    } catch (error) {
      settleFence();
      this.#inFlightWrites.delete(inFlightFence);
      this.#handleWriteFailure(error);
      return Promise.reject(error instanceof Error ? error : new Error('保存処理に失敗しました'));
    }
    void result.then(
      () => {
        settleFence();
        this.#inFlightWrites.delete(inFlightFence);
        this.#resumeHeartbeatAfterWrites();
      },
      (error: unknown) => {
        settleFence();
        this.#inFlightWrites.delete(inFlightFence);
        this.#handleWriteFailure(error);
        this.#resumeHeartbeatAfterWrites();
      },
    );
    return result;
  }

  /** 永続writeを直列化し、保存直前のCAS heartbeatで十分な期限を持つproofへ更新する。 */
  async #runPersistedFencedWrite<T>(
    operation: (token: string, proof: WorkspaceLeaseProof) => T | Promise<T>,
    token: string,
  ): Promise<T> {
    this.#clearHeartbeatTimer();
    const previous = this.#persistedWriteTail;
    const result = previous.then(async () => {
      await this.#heartbeatInFlight;
      const active = this.#activeLeaseWrite(token);
      const persistence = this.#runtime.persistence();
      if (active === undefined || persistence === undefined) {
        throw new LeaseFenceRejectedError();
      }
      const refreshed = await persistence.heartbeatWorkspaceLease(
        this.#proof(active.owner),
        this.#runtime.now() + this.#runtime.timing.leaseDurationMs,
      );
      const current = this.#activeLeaseWrite(token);
      if (
        current === undefined ||
        refreshed.courseId !== this.#courseId ||
        refreshed.workspaceId !== this.#workspaceId ||
        refreshed.ownerId !== current.owner.ownerId ||
        refreshed.token !== current.owner.token ||
        refreshed.dataEpoch !== current.owner.dataEpoch ||
        refreshed.expiresAt <= this.#runtime.now()
      ) {
        throw new LeaseFenceRejectedError();
      }
      const next: LeaseOwner = {
        ownerId: refreshed.ownerId,
        token: refreshed.token,
        dataEpoch: refreshed.dataEpoch,
        expiresAt: refreshed.expiresAt,
      };
      this.#owner = next;
      this.#setSnapshot({
        status: current.status,
        coordination: this.#coordination(),
        ownerId: next.ownerId,
        expiresAt: next.expiresAt,
      });
      this.#postHeartbeatNotification(next);
      return operation(token, this.#proof(next));
    });
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.#persistedWriteTail = settled;
    void settled.then(() => {
      if (this.#persistedWriteTail === settled) this.#persistedWriteTail = Promise.resolve();
    });
    return result;
  }

  /** await前後で現在tabの有効なwrite ownerとstatusを同じ瞬間の組として読み直す。 */
  #activeLeaseWrite(token: string): ActiveLeaseWrite | undefined {
    const status = this.#snapshot.status;
    const owner = this.#owner;
    if (
      this.#disposed ||
      (status !== 'owned' && status !== 'yielding') ||
      owner?.ownerId !== this.#runtime.tabId ||
      owner.token !== token
    ) {
      return undefined;
    }
    return { owner, status };
  }

  /** 最後の永続writeがsettleした時だけ定期heartbeatを再開する。 */
  #resumeHeartbeatAfterWrites(): void {
    if (
      this.#inFlightWrites.size === 0 &&
      this.#revalidationInFlight === undefined &&
      this.#runtime.persistence() !== undefined &&
      this.#boundDataEpoch !== undefined
    ) {
      this.#scheduleHeartbeat();
    }
  }

  /** 永続fence拒否だけをownership再検証へ送り、mutation競合は呼出側retryへ委ねる。 */
  #handleWriteFailure(error: unknown): void {
    if (error instanceof LeaseFenceRejectedError) this.revalidatePersistentLease();
  }

  /** local ownerへcourse/workspaceを補い、Repositoryが全field検証できるproofにする。 */
  #proof(owner: LeaseOwner): WorkspaceLeaseProof {
    return {
      courseId: this.#courseId,
      workspaceId: this.#workspaceId,
      ownerId: owner.ownerId,
      token: owner.token,
      dataEpoch: owner.dataEpoch,
      expiresAt: owner.expiresAt,
    };
  }

  /** in-flight writeとbeforeYieldをsettleしてからleaseを解放する。 */
  async release(): Promise<void> {
    if (this.#disposed || this.#snapshot.status === 'released') return;
    const owner = this.#owner;
    const startedFromLocalRescue = this.#snapshot.status === 'local-rescue';
    if (
      (this.#snapshot.status === 'owned' || startedFromLocalRescue) &&
      owner?.ownerId === this.#runtime.tabId
    ) {
      this.#setSnapshot({
        status: 'yielding',
        coordination: startedFromLocalRescue ? 'unavailable' : this.#coordination(),
        ownerId: owner.ownerId,
        expiresAt: owner.expiresAt,
      });
      await this.#settleBeforeYield();
      if (!this.#isYieldingToken(owner.token)) return;
      if (startedFromLocalRescue) {
        this.#finishRelease();
        return;
      }
      const currentOwner = await this.#ownerAfterHeartbeatSettles(owner.token);
      if (!this.#isYieldingToken(owner.token) || currentOwner === undefined) return;
      await this.#commitRelease(currentOwner);
    }
    this.#finishRelease();
  }

  /** handle単体のtimer・listener・leaseを同期的に破棄する。 */
  dispose(): void {
    if (this.#disposed) return;
    const owner = this.#owner;
    if (this.#snapshot.status === 'owned' && owner?.ownerId === this.#runtime.tabId) {
      void this.#commitRelease(owner);
    }
    this.#disposed = true;
    this.#finishRelease();
    this.#listeners.clear();
  }

  /** validated messageを現在workspaceのstate machineへ適用する。 */
  receive(message: LeaseMessage): void {
    if (this.#disposed || message.senderId === this.#runtime.tabId) return;
    switch (message.type) {
      case 'probe':
        if (this.#snapshot.status === 'owned' || this.#snapshot.status === 'yielding') {
          this.#publishHeartbeat();
        }
        break;
      case 'claim':
        this.#receiveClaim(message);
        break;
      case 'heartbeat':
        this.#receiveHeartbeat(message);
        break;
      case 'release':
        this.#receiveRelease(message);
        break;
      case 'takeover-request':
        this.#receiveTakeoverRequest(message);
        break;
      case 'yield-ack':
        this.#receiveYieldAck(message);
        break;
    }
  }

  /** focus/pageshow/visible復帰時に即writeを閉じ、永続heartbeat CASで再検証する。 */
  revalidatePersistentLease(): void {
    const persistence = this.#runtime.persistence();
    if (persistence === undefined || this.#disposed) return;
    if (this.#revalidationInFlight !== undefined) {
      this.#revalidationRequested = true;
      return;
    }
    this.#revalidationRequested = false;
    const owner = this.#owner;
    const startedFromLocalRescue = this.#snapshot.status === 'local-rescue';
    if (
      (this.#snapshot.status !== 'owned' && !startedFromLocalRescue) ||
      owner?.ownerId !== this.#runtime.tabId
    ) {
      void this.#reconcilePersistentOwner();
      return;
    }
    const generation = ++this.#persistenceGeneration;
    this.#clearHeartbeatTimer();
    this.#setSnapshot({
      status: 'yielding',
      coordination: this.#coordination(),
      ownerId: owner.ownerId,
      expiresAt: owner.expiresAt,
    });
    const operation = (async () => {
      await this.#settleBeforeYield();
      const currentOwner = await this.#ownerAfterHeartbeatSettles(owner.token);
      if (
        this.#isPersistenceOperationStale(generation) ||
        !this.#isYieldingToken(owner.token) ||
        currentOwner === undefined
      ) {
        return;
      }
      if (startedFromLocalRescue) {
        this.#beginClaim();
        return;
      }
      this.#setSnapshot({ status: 'claiming', coordination: this.#coordination() });
      try {
        const refreshed = await persistence.heartbeatWorkspaceLease(
          this.#proof(currentOwner),
          this.#runtime.now() + this.#runtime.timing.leaseDurationMs,
        );
        if (this.#isPersistenceOperationStale(generation)) return;
        this.#becomePersistedOwned(refreshed);
      } catch {
        if (this.#isPersistenceOperationStale(generation)) return;
        let persisted: WorkspaceLeaseProof | undefined;
        try {
          persisted = await persistence.readWorkspaceLease(this.#courseId, this.#workspaceId);
        } catch {
          this.#finishRelease();
          return;
        }
        if (this.#isPersistenceOperationStale(generation)) return;
        if (persisted !== undefined && persisted.expiresAt > this.#runtime.now()) {
          if (!this.#adoptPersistedSelfOwner(persisted)) this.#becomeReadOnly(persisted);
        } else {
          this.#beginClaim();
        }
      }
    })();
    const guarded = operation.finally(() => {
      if (this.#revalidationInFlight !== guarded) return;
      this.#revalidationInFlight = undefined;
      if (!this.#revalidationRequested || this.#disposed) return;
      this.#revalidationRequested = false;
      void this.#reconcilePersistentOwner();
    });
    this.#revalidationInFlight = guarded;
  }

  /** 永続claim不能時はownedと分離したlocal rescue、非永続環境はlocal ownerへ切り替える。 */
  activateFallback(): void {
    if (this.#disposed) return;
    this.#clearAllTimers();
    const token = this.#owner?.token ?? this.#candidate?.token ?? this.#runtime.createId();
    this.#owner = {
      ownerId: this.#runtime.tabId,
      token,
      dataEpoch: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
    };
    this.#candidate = undefined;
    this.#bestCandidate = undefined;
    this.#observedOwner = undefined;
    const pending = this.#pendingTakeover;
    this.#pendingTakeover = undefined;
    if (pending !== undefined) {
      this.#runtime.cancel(pending.timer);
      pending.resolve(true);
    }
    this.#setSnapshot({
      status: this.#runtime.persistence() === undefined ? 'owned' : 'local-rescue',
      coordination: 'unavailable',
      ownerId: this.#runtime.tabId,
    });
  }

  /** probe後のclaim候補を新tokenで開始する。 */
  #beginClaim(): void {
    if (this.#disposed) return;
    if (!this.#runtime.coordinationAvailable() && this.#runtime.persistence() === undefined) {
      this.activateFallback();
      return;
    }
    this.#clearClaimTimers();
    this.#clearExpiryTimer();
    const token = this.#runtime.createId();
    const candidate: LeaseOwner = {
      ownerId: this.#runtime.tabId,
      token,
      dataEpoch: 0,
      expiresAt: this.#runtime.now() + this.#runtime.timing.leaseDurationMs,
    };
    this.#candidate = candidate;
    this.#bestCandidate = candidate;
    this.#observedOwner = undefined;
    this.#owner = undefined;
    this.#setSnapshot({ status: 'claiming', coordination: this.#coordination() });
    const posted = this.#runtime.post({
      version: MESSAGE_VERSION,
      type: 'probe',
      courseId: this.#courseId,
      workspaceId: this.#workspaceId,
      senderId: this.#runtime.tabId,
      requestId: this.#runtime.createId(),
      sentAt: this.#runtime.now(),
    });
    if (!posted && this.#runtime.persistence() === undefined) return;
    this.#probeTimer = this.#runtime.schedule(() => {
      this.#finishProbe(candidate);
    }, this.#runtime.timing.probeDurationMs);
  }

  /** probe中にownerを観測した場合は待機し、なければclaimを配信する。 */
  #finishProbe(candidate: LeaseOwner): void {
    this.#probeTimer = undefined;
    if (this.#disposed || this.#candidate?.token !== candidate.token) return;
    if (this.#runtime.persistence() !== undefined) {
      void this.#claimPersisted(candidate);
      return;
    }
    if (this.#observedOwner !== undefined && this.#observedOwner.expiresAt > this.#runtime.now()) {
      this.#becomeReadOnly(this.#observedOwner);
      return;
    }
    const claim: LeaseOwner = {
      ...candidate,
      expiresAt: this.#runtime.now() + this.#runtime.timing.leaseDurationMs,
    };
    this.#candidate = claim;
    this.#bestCandidate = claim;
    if (
      !this.#runtime.post({
        version: MESSAGE_VERSION,
        type: 'claim',
        courseId: this.#courseId,
        workspaceId: this.#workspaceId,
        senderId: this.#runtime.tabId,
        token: claim.token,
        sentAt: this.#runtime.now(),
        expiresAt: claim.expiresAt,
      })
    ) {
      return;
    }
    this.#arbitrationTimer = this.#runtime.schedule(() => {
      this.#finishArbitration(claim);
    }, this.#runtime.timing.arbitrationDurationMs);
  }

  /** arbitration winnerだけをownerへし、他候補はread-onlyへする。 */
  #finishArbitration(candidate: LeaseOwner): void {
    this.#arbitrationTimer = undefined;
    if (this.#disposed || this.#candidate?.token !== candidate.token) return;
    const observed = this.#observedOwner;
    if (observed !== undefined && observed.expiresAt > this.#runtime.now()) {
      this.#becomeReadOnly(observed);
      return;
    }
    const winner = this.#bestCandidate ?? candidate;
    if (winner.ownerId !== this.#runtime.tabId || winner.token !== candidate.token) {
      this.#becomeReadOnly(winner);
      return;
    }
    this.#becomeOwned(candidate.token);
  }

  /** Broadcast観測値を所有権判定に使わず、IndexedDB CAS結果だけでownerへ遷移する。 */
  async #claimPersisted(candidate: LeaseOwner): Promise<void> {
    const persistence = this.#runtime.persistence();
    if (persistence === undefined) return;
    const generation = ++this.#persistenceGeneration;
    let result;
    try {
      result = await persistence.tryClaimWorkspaceLease({
        courseId: this.#courseId,
        workspaceId: this.#workspaceId,
        ownerId: this.#runtime.tabId,
        token: candidate.token,
        ...(this.#boundDataEpoch === undefined ? {} : { dataEpoch: this.#boundDataEpoch }),
        expiresAt: this.#runtime.now() + this.#runtime.timing.leaseDurationMs,
      });
    } catch {
      if (generation === this.#persistenceGeneration && !this.#disposed) {
        this.activateFallback();
      }
      return;
    }
    if (this.#disposed || this.#candidate?.token !== candidate.token) {
      return;
    }
    if (generation !== this.#persistenceGeneration) {
      if (result.acquired && this.#snapshot.status === 'claiming') {
        this.#becomePersistedOwned(result.proof);
      }
      return;
    }
    if (result.acquired) {
      this.#becomePersistedOwned(result.proof);
      return;
    }
    if (result.reason === 'data-epoch-mismatch') {
      this.#finishRelease();
      return;
    }
    if (result.owner !== undefined && result.owner.expiresAt > this.#runtime.now()) {
      this.#becomeReadOnly(result.owner);
      return;
    }
    this.#beginClaim();
  }

  /** CAS成功proofだけをownedへ昇格し、Broadcastへは通知だけを送る。 */
  #becomePersistedOwned(proof: WorkspaceLeaseProof): boolean {
    if (!this.#bindPersistentDataEpoch(proof.dataEpoch)) return false;
    this.#clearClaimTimers();
    this.#clearExpiryTimer();
    const owner: LeaseOwner = {
      ownerId: proof.ownerId,
      token: proof.token,
      dataEpoch: proof.dataEpoch,
      expiresAt: proof.expiresAt,
    };
    this.#owner = owner;
    this.#candidate = undefined;
    this.#bestCandidate = undefined;
    this.#observedOwner = undefined;
    this.#setSnapshot({
      status: 'owned',
      coordination: this.#coordination(),
      ownerId: owner.ownerId,
      expiresAt: owner.expiresAt,
    });
    this.#postHeartbeatNotification(owner);
    this.#scheduleHeartbeat();
    return true;
  }

  /** 新tokenをlocal ownerへ昇格しheartbeatを開始する。 */
  #becomeOwned(token: string): void {
    this.#clearClaimTimers();
    this.#clearExpiryTimer();
    const owner: LeaseOwner = {
      ownerId: this.#runtime.tabId,
      token,
      dataEpoch: 0,
      expiresAt: this.#runtime.now() + this.#runtime.timing.leaseDurationMs,
    };
    this.#owner = owner;
    this.#candidate = undefined;
    this.#bestCandidate = undefined;
    this.#observedOwner = undefined;
    this.#setSnapshot({
      status: 'owned',
      coordination: this.#coordination(),
      ownerId: owner.ownerId,
      expiresAt: owner.expiresAt,
    });
    this.#publishHeartbeat();
    this.#scheduleHeartbeat();
  }

  /** active ownerを保持して期限監視付きread-onlyへ遷移する。 */
  #becomeReadOnly(owner: LeaseOwner): void {
    if (!this.#bindPersistentDataEpoch(owner.dataEpoch)) return;
    this.#clearClaimTimers();
    this.#owner = owner;
    this.#candidate = undefined;
    this.#bestCandidate = undefined;
    this.#observedOwner = undefined;
    this.#setSnapshot({
      status: 'read-only',
      coordination: this.#coordination(),
      ownerId: owner.ownerId,
      expiresAt: owner.expiresAt,
    });
    this.#scheduleExpiry(owner);
  }

  /** claiming中のcandidateを決定的tie-breakへ追加する。 */
  #receiveClaim(message: ClaimMessage): void {
    if (this.#runtime.persistence() !== undefined) {
      void this.#reconcilePersistentOwner();
      return;
    }
    if (message.expiresAt <= this.#runtime.now() || this.#retiredTokens.has(message.token)) return;
    const contender: LeaseOwner = {
      ownerId: message.senderId,
      token: message.token,
      dataEpoch: 0,
      expiresAt: message.expiresAt,
    };
    if (this.#snapshot.status === 'claiming') {
      if (this.#observedOwner !== undefined) return;
      const current = this.#bestCandidate;
      if (current === undefined || compareOwners(contender, current) < 0) {
        this.#bestCandidate = contender;
      }
      return;
    }
    if (this.#snapshot.status === 'owned' || this.#snapshot.status === 'yielding') {
      this.#publishHeartbeat();
    }
  }

  /** active tokenだけheartbeatで延長し、probe中は既存ownerを優先する。 */
  #receiveHeartbeat(message: HeartbeatMessage): void {
    if (this.#runtime.persistence() !== undefined) {
      void this.#reconcilePersistentOwner();
      return;
    }
    if (message.expiresAt <= this.#runtime.now() || this.#retiredTokens.has(message.token)) return;
    const incoming: LeaseOwner = {
      ownerId: message.senderId,
      token: message.token,
      dataEpoch: 0,
      expiresAt: message.expiresAt,
    };
    if (this.#snapshot.status === 'claiming') {
      this.#observedOwner = incoming;
      return;
    }
    if (this.#snapshot.status !== 'read-only') return;
    const current = this.#owner;
    if (
      current !== undefined &&
      current.ownerId === incoming.ownerId &&
      current.token === incoming.token
    ) {
      if (incoming.expiresAt >= current.expiresAt) this.#becomeReadOnly(incoming);
      return;
    }
    if (current === undefined || current.expiresAt <= this.#runtime.now()) {
      this.#becomeReadOnly(incoming);
    }
  }

  /** 現ownerとtokenが一致するreleaseだけを受理する。 */
  #receiveRelease(message: ReleaseMessage): void {
    if (this.#runtime.persistence() !== undefined) {
      void this.#reconcilePersistentOwner();
      return;
    }
    const owner = this.#owner;
    if (
      owner === undefined ||
      owner.ownerId !== message.senderId ||
      owner.token !== message.token ||
      this.#retiredTokens.has(message.token)
    ) {
      return;
    }
    this.#retireToken(message.token);
    this.#clearExpiryTimer();
    this.#owner = undefined;
    const pending = this.#pendingTakeover;
    if (
      pending !== undefined &&
      pending.targetOwnerId === message.senderId &&
      pending.targetToken === message.token
    ) {
      return;
    }
    this.#beginClaim();
  }

  /** Broadcast通知を契機に永続正本を再読し、配送順と無関係にlocal stateを収束させる。 */
  async #reconcilePersistentOwner(): Promise<void> {
    const persistence = this.#runtime.persistence();
    if (persistence === undefined || this.#disposed) return;
    if (this.#revalidationInFlight !== undefined) {
      this.#revalidationRequested = true;
      return;
    }
    const mustSettleOwnedSession =
      (this.#snapshot.status === 'owned' || this.#snapshot.status === 'local-rescue') &&
      this.#owner?.ownerId === this.#runtime.tabId;
    const generation = ++this.#persistenceGeneration;
    let persisted: WorkspaceLeaseProof | undefined;
    try {
      persisted = await persistence.readWorkspaceLease(this.#courseId, this.#workspaceId);
    } catch {
      return;
    }
    if (this.#isPersistenceOperationStale(generation)) return;
    if (persisted !== undefined && persisted.expiresAt > this.#runtime.now()) {
      if (this.#adoptPersistedSelfOwner(persisted)) return;
      if (mustSettleOwnedSession) {
        this.revalidatePersistentLease();
        return;
      }
      this.#becomeReadOnly(persisted);
      return;
    }
    if (this.#pendingTakeover !== undefined) return;
    if (mustSettleOwnedSession) {
      this.revalidatePersistentLease();
      return;
    }
    this.#beginClaim();
  }

  /** 自分のactive tokenを狙うtakeoverだけで直ちに新規writeを閉じる。 */
  #receiveTakeoverRequest(message: TakeoverRequestMessage): void {
    const owner = this.#owner;
    if (
      this.#snapshot.status !== 'owned' ||
      owner?.ownerId !== this.#runtime.tabId ||
      owner.token !== message.targetToken ||
      message.targetOwnerId !== this.#runtime.tabId
    ) {
      return;
    }
    this.#setSnapshot({
      status: 'yielding',
      coordination: this.#coordination(),
      ownerId: owner.ownerId,
      expiresAt: owner.expiresAt,
    });
    this.#publishHeartbeat();
    this.#scheduleHeartbeat();
    void this.#yieldTo(message, owner);
  }

  /** old ownerのrelease tokenとtargetが一致するackだけでtakeoverを確定する。 */
  #receiveYieldAck(message: YieldAckMessage): void {
    const pending = this.#pendingTakeover;
    if (
      pending === undefined ||
      message.targetOwnerId !== this.#runtime.tabId ||
      message.senderId !== pending.targetOwnerId ||
      message.releasedToken !== pending.targetToken ||
      message.requestId !== pending.requestId
    ) {
      return;
    }
    if (this.#runtime.persistence() !== undefined) {
      this.#runtime.cancel(pending.timer);
      void this.#completePersistentTakeover(pending);
      return;
    }
    this.#runtime.cancel(pending.timer);
    this.#pendingTakeover = undefined;
    this.#retireToken(message.releasedToken);
    this.#becomeOwned(pending.newToken);
    pending.resolve(true);
  }

  /** ack有無に依存せず永続ownerを再読し、空きworkspaceだけをCAS claimする。 */
  async #completePersistentTakeover(pending: PendingTakeover): Promise<void> {
    const persistence = this.#runtime.persistence();
    if (persistence === undefined || this.#pendingTakeover !== pending || this.#disposed) return;
    let owner: WorkspaceLeaseProof | undefined;
    try {
      owner = await persistence.readWorkspaceLease(this.#courseId, this.#workspaceId);
      if (owner !== undefined && owner.expiresAt > this.#runtime.now()) {
        if (this.#pendingTakeover !== pending) return;
        this.#runtime.cancel(pending.timer);
        this.#pendingTakeover = undefined;
        if (owner.ownerId === this.#runtime.tabId && owner.token === pending.newToken) {
          this.#retireToken(pending.targetToken);
          pending.resolve(this.#becomePersistedOwned(owner));
        } else {
          this.#becomeReadOnly(owner);
          pending.resolve(false);
        }
        return;
      }
      const result = await persistence.tryClaimWorkspaceLease({
        courseId: this.#courseId,
        workspaceId: this.#workspaceId,
        ownerId: this.#runtime.tabId,
        token: pending.newToken,
        ...(this.#boundDataEpoch === undefined ? {} : { dataEpoch: this.#boundDataEpoch }),
        expiresAt: this.#runtime.now() + this.#runtime.timing.leaseDurationMs,
      });
      if (!this.#isPendingTakeoverActive(pending)) return;
      this.#runtime.cancel(pending.timer);
      this.#pendingTakeover = undefined;
      if (result.acquired) {
        this.#retireToken(pending.targetToken);
        pending.resolve(this.#becomePersistedOwned(result.proof));
      } else {
        if (result.reason === 'data-epoch-mismatch') this.#finishRelease();
        else if (result.owner !== undefined) this.#becomeReadOnly(result.owner);
        pending.resolve(false);
      }
    } catch {
      if (this.#pendingTakeover !== pending) return;
      this.#runtime.cancel(pending.timer);
      this.#pendingTakeover = undefined;
      pending.resolve(false);
    }
  }

  /** 保存settleとbeforeYield後にrelease／targeted ackを順に配信する。 */
  async #yieldTo(message: TakeoverRequestMessage, owner: LeaseOwner): Promise<void> {
    await this.#settleBeforeYield();
    if (
      this.#disposed ||
      this.#snapshot.status !== 'yielding' ||
      this.#owner?.token !== owner.token
    ) {
      return;
    }
    const currentOwner = await this.#ownerAfterHeartbeatSettles(owner.token);
    if (!this.#isYieldingToken(owner.token) || currentOwner === undefined) return;
    const released = await this.#commitRelease(currentOwner);
    this.#finishRelease();
    if (!released) return;
    this.#runtime.post({
      version: MESSAGE_VERSION,
      type: 'yield-ack',
      courseId: this.#courseId,
      workspaceId: this.#workspaceId,
      senderId: this.#runtime.tabId,
      targetOwnerId: message.senderId,
      releasedToken: owner.token,
      requestId: message.requestId,
      sentAt: this.#runtime.now(),
    });
  }

  /** 現在までに開始済みのwriteと利用側autosave cleanupをsettleする。 */
  async #settleBeforeYield(): Promise<void> {
    const owner = this.#owner;
    if (owner === undefined) return;
    const token = owner.token;
    const generation = ++this.#yieldGeneration;
    const yieldFence: TabLeaseWriteFence = (operation) => {
      if (
        this.#disposed ||
        this.#snapshot.status !== 'yielding' ||
        this.#owner?.token !== token ||
        this.#yieldGeneration !== generation
      ) {
        return Promise.reject(new Error('yield用の編集権は失効しています'));
      }
      return this.#startFencedWrite(operation, this.#owner);
    };
    let flush: Promise<void>;
    try {
      flush = Promise.resolve(this.#beforeYield(yieldFence));
    } catch {
      // cleanup失敗で古いownerを残さず、fenceを閉じたままleaseを解放する。
      flush = Promise.resolve();
    }
    await Promise.allSettled([...this.#inFlightWrites, flush]);
    if (this.#yieldGeneration === generation) this.#yieldGeneration += 1;
    while (this.#inFlightWrites.size > 0) {
      await Promise.allSettled([...this.#inFlightWrites]);
    }
  }

  /** await中の外部遷移後も同じtokenのyieldが継続中か再確認する。 */
  #isYieldingToken(token: string): boolean {
    return this.#snapshot.status === 'yielding' && this.#owner?.token === token;
  }

  /** 新規heartbeatを止め、開始済みCASの反映後に同じtokenの最新proofを返す。 */
  async #ownerAfterHeartbeatSettles(token: string): Promise<LeaseOwner | undefined> {
    this.#clearHeartbeatTimer();
    await this.#heartbeatInFlight;
    return this.#owner?.token === token ? this.#owner : undefined;
  }

  /** awaitをまたいだ永続操作がdisposeまたは後続操作で失効していないか判定する。 */
  #isPersistenceOperationStale(generation: number): boolean {
    return this.#disposed || generation !== this.#persistenceGeneration;
  }

  /** handleが最初に観測したdata epochへ固定し、全置換後のstale再claimを閉じる。 */
  #bindPersistentDataEpoch(dataEpoch: number): boolean {
    if (this.#runtime.persistence() === undefined) return true;
    if (this.#boundDataEpoch === undefined) {
      this.#boundDataEpoch = dataEpoch;
      return true;
    }
    if (this.#boundDataEpoch === dataEpoch) return true;
    this.#finishRelease();
    return false;
  }

  /** 永続正本が現在のself tokenならclaim/revalidationを収束させ、yield中はstatusを保つ。 */
  #adoptPersistedSelfOwner(persisted: WorkspaceLeaseProof): boolean {
    if (persisted.ownerId !== this.#runtime.tabId) return false;
    const owner = this.#owner;
    const sameOwner =
      owner !== undefined &&
      owner.ownerId === persisted.ownerId &&
      owner.token === persisted.token &&
      owner.dataEpoch === persisted.dataEpoch;
    const sameCandidate =
      this.#candidate?.ownerId === persisted.ownerId && this.#candidate.token === persisted.token;
    if (this.#snapshot.status === 'claiming' && (sameOwner || sameCandidate)) {
      return this.#becomePersistedOwned(persisted);
    }
    if (this.#snapshot.status === 'owned' && sameOwner) {
      return this.#becomePersistedOwned(persisted);
    }
    if (this.#snapshot.status === 'yielding' && sameOwner) {
      this.#owner = {
        ownerId: persisted.ownerId,
        token: persisted.token,
        dataEpoch: persisted.dataEpoch,
        expiresAt: persisted.expiresAt,
      };
      this.#setSnapshot({
        status: 'yielding',
        coordination: this.#coordination(),
        ownerId: persisted.ownerId,
        expiresAt: persisted.expiresAt,
      });
      return true;
    }
    return false;
  }

  /** awaitをまたいだtakeover処理が現在も同じ要求を担当しているか判定する。 */
  #isPendingTakeoverActive(pending: PendingTakeover): boolean {
    return !this.#disposed && this.#pendingTakeover === pending;
  }

  /** owner tokenをrelease messageとしてbest-effort配信する。 */
  #publishRelease(owner: LeaseOwner): void {
    this.#retireToken(owner.token);
    this.#runtime.post({
      version: MESSAGE_VERSION,
      type: 'release',
      courseId: this.#courseId,
      workspaceId: this.#workspaceId,
      senderId: this.#runtime.tabId,
      token: owner.token,
      sentAt: this.#runtime.now(),
    });
  }

  /** 永続release CAS成功後だけrelease通知を配信する。 */
  async #commitRelease(owner: LeaseOwner): Promise<boolean> {
    const persistence = this.#runtime.persistence();
    if (persistence === undefined) {
      this.#publishRelease(owner);
      return true;
    }
    let released: boolean;
    try {
      released = await persistence.releaseWorkspaceLease(this.#proof(owner));
    } catch {
      return false;
    }
    if (!released) return false;
    this.#publishRelease(owner);
    return true;
  }

  /** local ownerの期限を更新してheartbeatを配信する。 */
  #publishHeartbeat(): void {
    if (this.#runtime.persistence() !== undefined) {
      void this.#heartbeatPersisted();
      return;
    }
    const owner = this.#owner;
    const status = this.#snapshot.status;
    if ((status !== 'owned' && status !== 'yielding') || owner?.ownerId !== this.#runtime.tabId) {
      return;
    }
    const refreshed: LeaseOwner = {
      ...owner,
      expiresAt: this.#runtime.now() + this.#runtime.timing.leaseDurationMs,
    };
    this.#owner = refreshed;
    this.#setSnapshot({
      status,
      coordination: this.#coordination(),
      ownerId: refreshed.ownerId,
      expiresAt: refreshed.expiresAt,
    });
    this.#runtime.post({
      version: MESSAGE_VERSION,
      type: 'heartbeat',
      courseId: this.#courseId,
      workspaceId: this.#workspaceId,
      senderId: this.#runtime.tabId,
      token: refreshed.token,
      sentAt: this.#runtime.now(),
      expiresAt: refreshed.expiresAt,
    });
  }

  /** 永続heartbeat CAS成功後だけlocal proofとBroadcast通知を更新する。 */
  #heartbeatPersisted(): Promise<void> {
    if (this.#heartbeatInFlight !== undefined) return this.#heartbeatInFlight;
    if (this.#boundDataEpoch !== undefined && this.#inFlightWrites.size > 0) {
      this.#clearHeartbeatTimer();
      return Promise.resolve();
    }
    const owner = this.#owner;
    const status = this.#snapshot.status;
    if ((status !== 'owned' && status !== 'yielding') || owner?.ownerId !== this.#runtime.tabId) {
      return Promise.resolve();
    }
    const persistence = this.#runtime.persistence();
    if (persistence === undefined) return Promise.resolve();
    const operation = (async () => {
      try {
        const refreshed = await persistence.heartbeatWorkspaceLease(
          this.#proof(owner),
          this.#runtime.now() + this.#runtime.timing.leaseDurationMs,
        );
        if (
          this.#disposed ||
          (this.#snapshot.status !== 'owned' && this.#snapshot.status !== 'yielding') ||
          this.#owner?.token !== owner.token
        ) {
          return;
        }
        const next: LeaseOwner = {
          ownerId: refreshed.ownerId,
          token: refreshed.token,
          dataEpoch: refreshed.dataEpoch,
          expiresAt: refreshed.expiresAt,
        };
        this.#owner = next;
        this.#setSnapshot({
          status: this.#snapshot.status,
          coordination: this.#coordination(),
          ownerId: next.ownerId,
          expiresAt: next.expiresAt,
        });
        this.#postHeartbeatNotification(next);
      } catch {
        await this.#reconcilePersistentOwner();
      }
    })();
    const guarded = operation.finally(() => {
      if (this.#heartbeatInFlight === guarded) this.#heartbeatInFlight = undefined;
    });
    this.#heartbeatInFlight = guarded;
    return guarded;
  }

  /** 現在の永続proofをBroadcast heartbeatとして通知する。 */
  #postHeartbeatNotification(owner: LeaseOwner): void {
    this.#runtime.post({
      version: MESSAGE_VERSION,
      type: 'heartbeat',
      courseId: this.#courseId,
      workspaceId: this.#workspaceId,
      senderId: this.#runtime.tabId,
      token: owner.token,
      sentAt: this.#runtime.now(),
      expiresAt: owner.expiresAt,
    });
  }

  /** owned中だけheartbeat timerを再帰予約する。 */
  #scheduleHeartbeat(): void {
    this.#clearHeartbeatTimer();
    if (
      (this.#snapshot.status !== 'owned' && this.#snapshot.status !== 'yielding') ||
      (this.#runtime.persistence() !== undefined && this.#boundDataEpoch === undefined) ||
      (this.#boundDataEpoch !== undefined && this.#inFlightWrites.size > 0) ||
      (!this.#runtime.coordinationAvailable() && this.#runtime.persistence() === undefined)
    ) {
      return;
    }
    this.#heartbeatTimer = this.#runtime.schedule(() => {
      this.#heartbeatTimer = undefined;
      if (this.#snapshot.status !== 'owned' && this.#snapshot.status !== 'yielding') return;
      this.#publishHeartbeat();
      this.#scheduleHeartbeat();
    }, this.#runtime.timing.heartbeatIntervalMs);
  }

  /** owner期限で同じtokenが残っている場合だけ再claimする。 */
  #scheduleExpiry(owner: LeaseOwner): void {
    this.#clearExpiryTimer();
    this.#expiryTimer = this.#runtime.schedule(
      () => {
        this.#expiryTimer = undefined;
        if (
          this.#snapshot.status === 'read-only' &&
          this.#pendingTakeover === undefined &&
          this.#owner?.ownerId === owner.ownerId &&
          this.#owner.token === owner.token &&
          this.#owner.expiresAt <= this.#runtime.now()
        ) {
          this.#retireToken(owner.token);
          this.#beginClaim();
        }
      },
      Math.max(1, owner.expiresAt - this.#runtime.now()),
    );
  }

  /** token再生を拒否するbounded tombstone setへ追加する。 */
  #retireToken(token: string): void {
    this.#retiredTokens.add(token);
    if (this.#retiredTokens.size > MAX_RETIRED_TOKENS) {
      const oldest = this.#retiredTokens.values().next().value;
      if (typeof oldest === 'string') this.#retiredTokens.delete(oldest);
    }
  }

  /** release snapshotへ遷移し全非同期資源とMap登録を外す。 */
  #finishRelease(): void {
    this.#clearAllTimers();
    const pending = this.#pendingTakeover;
    this.#pendingTakeover = undefined;
    if (pending !== undefined) {
      this.#runtime.cancel(pending.timer);
      pending.resolve(false);
    }
    this.#owner = undefined;
    this.#candidate = undefined;
    this.#bestCandidate = undefined;
    this.#observedOwner = undefined;
    this.#setSnapshot({ status: 'released', coordination: this.#coordination() });
    this.#runtime.remove(this.#key, this);
  }

  /** snapshot内容が変わったときだけ新参照を作りsubscriberへ通知する。 */
  #setSnapshot(next: TabLeaseState): void {
    const current = this.#snapshot;
    if (
      current.status === next.status &&
      current.coordination === next.coordination &&
      current.ownerId === next.ownerId &&
      current.expiresAt === next.expiresAt
    ) {
      return;
    }
    this.#snapshot = Object.freeze({ ...next });
    for (const listener of [...this.#listeners]) listener();
  }

  /** 現在channel可用性をUI向けunionへ変換する。 */
  #coordination(): TabLeaseCoordination {
    return this.#runtime.coordinationAvailable() ? 'available' : 'unavailable';
  }

  /** claim handshake timerだけを停止する。 */
  #clearClaimTimers(): void {
    if (this.#probeTimer !== undefined) this.#runtime.cancel(this.#probeTimer);
    if (this.#arbitrationTimer !== undefined) this.#runtime.cancel(this.#arbitrationTimer);
    this.#probeTimer = undefined;
    this.#arbitrationTimer = undefined;
  }

  /** heartbeat timerを停止する。 */
  #clearHeartbeatTimer(): void {
    if (this.#heartbeatTimer !== undefined) this.#runtime.cancel(this.#heartbeatTimer);
    this.#heartbeatTimer = undefined;
  }

  /** owner expiry timerを停止する。 */
  #clearExpiryTimer(): void {
    if (this.#expiryTimer !== undefined) this.#runtime.cancel(this.#expiryTimer);
    this.#expiryTimer = undefined;
  }

  /** handleが保持する全timerを停止する。 */
  #clearAllTimers(): void {
    this.#clearClaimTimers();
    this.#clearHeartbeatTimer();
    this.#clearExpiryTimer();
    if (this.#pendingTakeover?.timer !== undefined) {
      this.#runtime.cancel(this.#pendingTakeover.timer);
    }
  }
}

/** Course・workspace別のediting leaseを単一BroadcastChannelで調停する。 */
export class TabLeaseCoordinator {
  readonly #handles = new Map<string, LeaseHandleImpl>();
  readonly #tabId: string;
  readonly #timing: LeaseTiming;
  readonly #now: () => number;
  readonly #setTimeout: (callback: () => void, delay: number) => unknown;
  readonly #clearTimeout: (timer: unknown) => void;
  readonly #idFactory: () => string;
  readonly #leasePersistence: TabLeasePersistence | undefined;
  readonly #lifecycleCleanups: Array<() => void> = [];
  #channel: BroadcastChannel | undefined;
  #coordinationAvailable = false;
  #disposed = false;

  constructor(options: TabLeaseCoordinatorOptions = {}) {
    this.#now = options.now ?? (() => Date.now());
    this.#setTimeout =
      options.setTimeout ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.#clearTimeout =
      options.clearTimeout ??
      ((timer) => {
        globalThis.clearTimeout(timer as number);
      });
    this.#idFactory = options.idFactory ?? defaultIdFactory;
    this.#leasePersistence = options.leasePersistence;
    this.#timing = {
      probeDurationMs: timingValue(options.probeDurationMs, 50, 5_000),
      arbitrationDurationMs: timingValue(options.arbitrationDurationMs, 20, 5_000),
      heartbeatIntervalMs: timingValue(options.heartbeatIntervalMs, 1_000, 10_000),
      leaseDurationMs: timingValue(options.leaseDurationMs, 4_000, MAX_LEASE_DURATION_MS),
      takeoverTimeoutMs: timingValue(options.takeoverTimeoutMs, 5_000, 30_000),
    };
    if (this.#timing.heartbeatIntervalMs >= this.#timing.leaseDurationMs) {
      throw new Error('heartbeat間隔はlease期限より短くする必要があります');
    }
    const storage = Object.hasOwn(options, 'storage') ? options.storage : defaultStorage();
    this.#tabId = resolveTabId(
      storage,
      () => this.#createId(),
      options.reuseStoredTabId ?? defaultReuseStoredTabId(),
    );
    const factory = options.channelFactory ?? defaultChannelFactory();
    try {
      this.#channel = factory?.(CHANNEL_NAME);
      if (this.#channel !== undefined) {
        this.#coordinationAvailable = true;
        this.#channel.onmessage = (event: MessageEvent<unknown>): void => {
          if (!this.#disposed) this.#receive(event.data);
        };
      }
    } catch {
      this.#channel = undefined;
      this.#coordinationAvailable = false;
    }
    const revalidate = (): void => {
      for (const handle of this.#handles.values()) handle.revalidatePersistentLease();
    };
    const visible = options.isVisible ?? (() => document.visibilityState === 'visible');
    const visibilityChanged = (): void => {
      if (visible()) revalidate();
    };
    if (options.lifecycleTarget !== undefined) {
      for (const type of ['focus', 'pageshow']) {
        options.lifecycleTarget.addEventListener(type, revalidate);
        this.#lifecycleCleanups.push(() => {
          options.lifecycleTarget?.removeEventListener(type, revalidate);
        });
      }
      options.lifecycleTarget.addEventListener('visibilitychange', visibilityChanged);
      this.#lifecycleCleanups.push(() => {
        options.lifecycleTarget?.removeEventListener('visibilitychange', visibilityChanged);
      });
    } else if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('focus', revalidate);
      window.addEventListener('pageshow', revalidate);
      document.addEventListener('visibilitychange', visibilityChanged);
      this.#lifecycleCleanups.push(
        () => {
          window.removeEventListener('focus', revalidate);
        },
        () => {
          window.removeEventListener('pageshow', revalidate);
        },
        () => {
          document.removeEventListener('visibilitychange', visibilityChanged);
        },
      );
    }
  }

  /** workspaceのlease handleを作り、同じkeyなら既存参照を返す。 */
  acquire(courseId: string, workspaceId: string, options: TabLeaseAcquireOptions): TabLeaseHandle {
    if (this.#disposed) throw new Error('TabLeaseCoordinator is disposed');
    if (!isValidId(courseId) || !isValidId(workspaceId)) {
      throw new Error('Course IDとworkspace IDは空でないbounded文字列が必要です');
    }
    if (typeof options.beforeYield !== 'function') {
      throw new Error('beforeYield callbackが必要です');
    }
    const key = workspaceKey(courseId, workspaceId);
    const existing = this.#handles.get(key);
    if (existing !== undefined) return existing;
    const runtime: LeaseRuntime = {
      tabId: this.#tabId,
      timing: this.#timing,
      now: this.#now,
      createId: () => this.#createId(),
      schedule: (callback, delay) => this.#setTimeout(callback, delay),
      cancel: (timer) => {
        this.#clearTimeout(timer);
      },
      post: (message) => this.#post(message),
      coordinationAvailable: () => this.#coordinationAvailable,
      persistence: () => this.#leasePersistence,
      remove: (handleKey, handle) => {
        if (this.#handles.get(handleKey) === handle) this.#handles.delete(handleKey);
      },
    };
    const handle = new LeaseHandleImpl(courseId, workspaceId, options, runtime);
    this.#handles.set(key, handle);
    handle.start();
    return handle;
  }

  /** 全handleをreleaseしlistener・channel・timer参照を破棄する。 */
  dispose(): void {
    if (this.#disposed) return;
    for (const handle of [...this.#handles.values()]) handle.dispose();
    this.#handles.clear();
    for (const cleanup of this.#lifecycleCleanups.splice(0)) cleanup();
    this.#disposed = true;
    if (this.#channel !== undefined) {
      this.#channel.onmessage = null;
      try {
        this.#channel.close();
      } catch {
        // cleanup時のBrowser API失敗は再throwしない。
      }
    }
    this.#channel = undefined;
    this.#coordinationAvailable = false;
  }

  /** factoryの戻り値を公開messageに使えるstrict IDへ限定する。 */
  #createId(): string {
    const id = this.#idFactory();
    if (!isValidId(id)) throw new Error('idFactoryは空でないbounded文字列を返す必要があります');
    return id;
  }

  /** channelへbest-effort送信し、失敗時は全handleをlocal fallbackへ移す。 */
  #post(message: LeaseMessage): boolean {
    if (!this.#coordinationAvailable || this.#channel === undefined) return false;
    try {
      this.#channel.postMessage(message);
      return true;
    } catch {
      this.#degradeCoordination();
      return false;
    }
  }

  /** strict messageをworkspace handleだけへ配送する。 */
  #receive(value: unknown): void {
    const message = parseLeaseMessage(value, this.#now());
    if (message === undefined || message.senderId === this.#tabId) return;
    this.#handles.get(workspaceKey(message.courseId, message.workspaceId))?.receive(message);
  }

  /** channel runtime失敗をunavailable付き単一tab編集へ切り替える。 */
  #degradeCoordination(): void {
    if (!this.#coordinationAvailable) return;
    this.#coordinationAvailable = false;
    if (this.#channel !== undefined) {
      this.#channel.onmessage = null;
      try {
        this.#channel.close();
      } catch {
        // local fallbackはchannel cleanup失敗に依存しない。
      }
    }
    this.#channel = undefined;
    for (const handle of this.#handles.values()) {
      if (this.#leasePersistence === undefined) handle.activateFallback();
      else handle.revalidatePersistentLease();
    }
  }
}
