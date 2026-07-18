import { describe, expect, it, vi } from 'vitest';
import {
  TabLeaseCoordinator,
  type TabLeaseCoordinatorOptions,
  type TabLeaseWriteFence,
} from '../../../src/core/persistence/TabLeaseCoordinator';
import {
  CourseProgressVersionConflictError,
  LeaseFenceRejectedError,
  type WorkspaceLeaseProof,
} from '../../../src/core/persistence/contracts';

const COURSE_ID = 'html-css';
const WORKSPACE_ID = 'workspace-first-heading';

/** PromiseのresolveをTest側へ公開する。 */
function deferred<T = void>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

/** fake timerを時刻順・登録順で決定的に実行する。 */
class FakeClock {
  now = 1_000;
  #nextId = 1;
  readonly #timers = new Map<number, { readonly dueAt: number; readonly callback: () => void }>();

  readonly setTimeout = (callback: () => void, delay: number): number => {
    const id = this.#nextId++;
    this.#timers.set(id, { dueAt: this.now + delay, callback });
    return id;
  };

  readonly clearTimeout = (id: unknown): void => {
    if (typeof id === 'number') this.#timers.delete(id);
  };

  /** 指定時間内に期限を迎えたcallbackを全て実行する。 */
  advance(milliseconds: number): void {
    const target = this.now + milliseconds;
    for (;;) {
      const next = [...this.#timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort(
          ([leftId, left], [rightId, right]) => left.dueAt - right.dueAt || leftId - rightId,
        )[0];
      if (next === undefined) break;
      const [id, timer] = next;
      this.#timers.delete(id);
      this.now = timer.dueAt;
      timer.callback();
    }
    this.now = target;
  }

  /** cleanup検証用に未実行timer数を返す。 */
  pendingCount(): number {
    return this.#timers.size;
  }
}

/** cloneされたsessionStorageを再現する同期memory Storage。 */
class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

/** native BroadcastChannelの必要部分だけを同期配送で再現する。 */
class FakeBroadcastChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly postedMessages: unknown[] = [];
  readonly name: string;
  readonly #hub: BroadcastHub;
  #closed = false;

  constructor(hub: BroadcastHub, name: string) {
    this.#hub = hub;
    this.name = name;
  }

  /** channelをhubから切断する。 */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#hub.disconnect(this);
  }

  /** 同名channelへpayloadを同期配送する。 */
  postMessage(message: unknown): void {
    if (this.#closed) throw new Error('BroadcastChannel is closed');
    this.postedMessages.push(message);
    this.#hub.broadcast(this, message);
  }

  /** Testから任意payloadを注入する。 */
  receive(message: unknown): void {
    if (!this.#closed) this.onmessage?.(new MessageEvent('message', { data: message }));
  }
}

/** 複数tab相当のchannelを同じbusへ接続する。 */
class BroadcastHub {
  readonly channels: FakeBroadcastChannel[] = [];
  readonly droppedTypes = new Set<string>();

  /** native互換factoryへ渡すchannelを作る。 */
  connect(name: string): FakeBroadcastChannel {
    const channel = new FakeBroadcastChannel(this, name);
    this.channels.push(channel);
    return channel;
  }

  /** close済みchannelを配送先から外す。 */
  disconnect(channel: FakeBroadcastChannel): void {
    const index = this.channels.indexOf(channel);
    if (index >= 0) this.channels.splice(index, 1);
  }

  /** sender以外の同名channelへmessageを配送する。 */
  broadcast(sender: FakeBroadcastChannel, message: unknown): void {
    const type = (message as { readonly type?: unknown }).type;
    if (typeof type === 'string' && this.droppedTypes.has(type)) return;
    for (const channel of [...this.channels]) {
      if (channel !== sender && channel.name === sender.name) channel.receive(message);
    }
  }
}

/** IndexedDB lease portと同じCAS規則をmemoryで再現する。 */
class SharedLeasePersistence {
  readonly #owners = new Map<string, WorkspaceLeaseProof>();
  #dataEpoch = 0;
  #claimFailure: Error | undefined;
  #nextHeartbeatGate: Promise<void> | undefined;
  #heartbeatInFlight: Promise<WorkspaceLeaseProof> | undefined;
  readCount = 0;
  heartbeatCount = 0;

  constructor(private readonly now: () => number) {}

  /** 未所有または期限切れworkspaceだけをclaimする。 */
  async tryClaimWorkspaceLease(
    candidate: Omit<WorkspaceLeaseProof, 'dataEpoch'> & { readonly dataEpoch?: number },
  ): Promise<
    | { readonly acquired: true; readonly proof: WorkspaceLeaseProof }
    | {
        readonly acquired: false;
        readonly owner?: WorkspaceLeaseProof;
        readonly reason?: 'data-epoch-mismatch';
      }
  > {
    if (this.#claimFailure !== undefined) throw this.#claimFailure;
    const key = JSON.stringify([candidate.courseId, candidate.workspaceId]);
    const current = this.#owners.get(key);
    if (candidate.dataEpoch !== undefined && candidate.dataEpoch !== this.#dataEpoch) {
      return { acquired: false, reason: 'data-epoch-mismatch' };
    }
    if (current !== undefined && current.expiresAt > this.now()) {
      return { acquired: false, owner: structuredClone(current) };
    }
    const proof = { ...candidate, dataEpoch: this.#dataEpoch };
    this.#owners.set(key, proof);
    return { acquired: true, proof: structuredClone(proof) };
  }

  /** 現ownerを返す。 */
  async readWorkspaceLease(
    courseId: string,
    workspaceId: string,
  ): Promise<WorkspaceLeaseProof | undefined> {
    this.readCount += 1;
    return structuredClone(this.#owners.get(JSON.stringify([courseId, workspaceId])));
  }

  /** proof全fieldと期限が一致するときだけ更新する。 */
  async heartbeatWorkspaceLease(
    proof: WorkspaceLeaseProof,
    expiresAt: number,
  ): Promise<WorkspaceLeaseProof> {
    this.heartbeatCount += 1;
    const gate = this.#nextHeartbeatGate;
    this.#nextHeartbeatGate = undefined;
    const operation = (async () => {
      this.assertWrite(proof);
      if (gate !== undefined) await gate;
      this.assertWrite(proof);
      const refreshed = { ...proof, expiresAt };
      this.#owners.set(JSON.stringify([proof.courseId, proof.workspaceId]), refreshed);
      return structuredClone(refreshed);
    })();
    this.#heartbeatInFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.#heartbeatInFlight === operation) this.#heartbeatInFlight = undefined;
    }
  }

  /** proof全fieldが一致するときだけownerを解放する。 */
  async releaseWorkspaceLease(proof: WorkspaceLeaseProof): Promise<boolean> {
    await this.#heartbeatInFlight;
    try {
      this.assertWrite(proof);
    } catch {
      return false;
    }
    this.#owners.delete(JSON.stringify([proof.courseId, proof.workspaceId]));
    return true;
  }

  /** 次のheartbeat transaction完了をTest側gateまで保留する。 */
  deferNextHeartbeat(gate: Promise<void>): void {
    this.#nextHeartbeatGate = gate;
  }

  /** Testから永続正本を差し替える。 */
  forceOwner(proof: WorkspaceLeaseProof): void {
    this.#dataEpoch = proof.dataEpoch;
    this.#owners.set(JSON.stringify([proof.courseId, proof.workspaceId]), structuredClone(proof));
  }

  /** Import相当の全置換でleaseを消し、data epochを進める。 */
  replaceAll(): void {
    this.#owners.clear();
    this.#dataEpoch += 1;
  }

  /** 永続層を利用できないmemory救済scenario用にclaim失敗を固定する。 */
  rejectClaims(error = new Error('lease persistence unavailable')): void {
    this.#claimFailure = error;
  }

  /** 永続層復旧後の再claimを許可する。 */
  allowClaims(): void {
    this.#claimFailure = undefined;
  }

  /** stale proofのwriteを永続正本で拒否する。 */
  assertWrite(proof: WorkspaceLeaseProof): void {
    const current = this.#owners.get(JSON.stringify([proof.courseId, proof.workspaceId]));
    if (
      current === undefined ||
      current.ownerId !== proof.ownerId ||
      current.token !== proof.token ||
      current.dataEpoch !== proof.dataEpoch ||
      current.expiresAt !== proof.expiresAt ||
      proof.expiresAt <= this.now()
    ) {
      throw new LeaseFenceRejectedError();
    }
  }
}

/** Coordinator内の永続CAS continuationをflushする。 */
async function flushPromises(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

/** strict IDを決定的に払い出すCoordinatorを作る。 */
function createCoordinator(
  tabName: string,
  hub: BroadcastHub,
  clock: FakeClock,
  overrides: Partial<TabLeaseCoordinatorOptions> = {},
): TabLeaseCoordinator {
  let sequence = 0;
  return new TabLeaseCoordinator({
    channelFactory: (name) => hub.connect(name) as unknown as BroadcastChannel,
    storage: undefined,
    now: () => clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    idFactory: () => `${tabName}-${String(++sequence)}`,
    probeDurationMs: 10,
    arbitrationDurationMs: 5,
    heartbeatIntervalMs: 20,
    leaseDurationMs: 60,
    takeoverTimeoutMs: 80,
    ...overrides,
  });
}

/** probeとclaim arbitrationを完了させる。 */
function finishClaim(clock: FakeClock): void {
  clock.advance(10);
  clock.advance(5);
}

describe('TabLeaseCoordinator', () => {
  it('tsumucode-editingでprobe→claimし、参照安定snapshotを購読できる', () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const coordinator = createCoordinator('tab-a', hub, clock);
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    const initial = handle.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = handle.subscribe(listener);

    expect(hub.channels[0]?.name).toBe('tsumucode-editing');
    expect(initial).toBe(handle.getSnapshot());
    expect(initial.status).toBe('claiming');
    finishClaim(clock);

    expect(handle.getSnapshot().status).toBe('owned');
    expect(handle.getSnapshot()).toBe(handle.getSnapshot());
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    coordinator.dispose();
  });

  it('同時claimはtab IDとtokenの辞書順tie-breakで1 ownerへ収束する', () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const first = createCoordinator('tab-b', hub, clock);
    const second = createCoordinator('tab-a', hub, clock);
    const firstHandle = first.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    const secondHandle = second.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });

    finishClaim(clock);

    expect(firstHandle.getSnapshot().status).toBe('read-only');
    expect(secondHandle.getSnapshot().status).toBe('owned');
    expect(firstHandle.getSnapshot().ownerId).toBe(secondHandle.getSnapshot().ownerId);
    first.dispose();
    second.dispose();
  });

  it('sessionStorageが別tabへcloneされてもinstance IDを再利用せず1 ownerへ収束する', () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const clonedStorage = new MemoryStorage();
    const first = createCoordinator('tab-b', hub, clock, { storage: clonedStorage });
    const second = createCoordinator('tab-a', hub, clock, { storage: clonedStorage });
    const firstHandle = first.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    const secondHandle = second.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });

    finishClaim(clock);

    expect(
      [firstHandle, secondHandle].filter((handle) => handle.getSnapshot().status === 'owned'),
    ).toHaveLength(1);
    first.dispose();
    second.dispose();
  });

  it('late joinのprobeへownerがheartbeatで応答しread-onlyにする', () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const owner = createCoordinator('tab-a', hub, clock);
    const ownerHandle = owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    const late = createCoordinator('tab-b', hub, clock);
    const lateHandle = late.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });

    clock.advance(10);

    expect(ownerHandle.getSnapshot().status).toBe('owned');
    expect(lateHandle.getSnapshot().status).toBe('read-only');
    expect(lateHandle.getSnapshot().ownerId).toBe(ownerHandle.getSnapshot().ownerId);
    owner.dispose();
    late.dispose();
  });

  it('takeoverは旧ownerのin-flight writeとbeforeYieldを待ち、ack後だけ新ownerにする', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const write = deferred();
    const yielded = deferred();
    const owner = createCoordinator('tab-a', hub, clock);
    const ownerHandle = owner.acquire(COURSE_ID, WORKSPACE_ID, {
      beforeYield: () => yielded.promise,
    });
    finishClaim(clock);
    const next = createCoordinator('tab-b', hub, clock);
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    const writePromise = ownerHandle.runFencedWrite(() => write.promise);

    const takeoverPromise = nextHandle.takeover();

    expect(ownerHandle.getSnapshot().status).toBe('yielding');
    expect(nextHandle.getSnapshot().status).toBe('read-only');
    write.resolve();
    await writePromise;
    await Promise.resolve();
    expect(nextHandle.getSnapshot().status).toBe('read-only');
    yielded.resolve();

    await expect(takeoverPromise).resolves.toBe(true);
    expect(ownerHandle.getSnapshot().status).toBe('released');
    expect(nextHandle.getSnapshot().status).toBe('owned');
    owner.dispose();
    next.dispose();
  });

  it('beforeYieldから開始するpending autosave flushだけは元tokenでfenceしてack前に待つ', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const flush = deferred();
    const flushWrite = vi.fn(() => flush.promise);
    const owner = createCoordinator('tab-a', hub, clock);
    owner.acquire(COURSE_ID, WORKSPACE_ID, {
      beforeYield: (yieldFence: TabLeaseWriteFence) => {
        return yieldFence(flushWrite);
      },
    });
    finishClaim(clock);
    const next = createCoordinator('tab-b', hub, clock);
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);

    const takeoverPromise = nextHandle.takeover();
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    const statusBeforeFlushSettles = nextHandle.getSnapshot().status;
    flush.resolve();

    await expect(takeoverPromise).resolves.toBe(true);
    expect(flushWrite).toHaveBeenCalledTimes(1);
    expect(statusBeforeFlushSettles).toBe('read-only');
    owner.dispose();
    next.dispose();
  });

  it('active write解決後にasync drainされるpending writeもyield capabilityで保存してからackする', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const activeWrite = deferred();
    const pendingWrite = deferred();
    const pendingWriteOperation = vi.fn(() => pendingWrite.promise);
    const owner = createCoordinator('tab-a', hub, clock);
    const ownerHandle = owner.acquire(COURSE_ID, WORKSPACE_ID, {
      beforeYield: async (yieldFence: TabLeaseWriteFence) => {
        await activeWrite.promise;
        await yieldFence(pendingWriteOperation);
      },
    });
    finishClaim(clock);
    const next = createCoordinator('tab-b', hub, clock);
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    const activeWritePromise = ownerHandle.runFencedWrite(() => activeWrite.promise);

    const takeoverPromise = nextHandle.takeover();
    activeWrite.resolve();
    await activeWritePromise;
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    const statusBeforePendingSettles = nextHandle.getSnapshot().status;
    pendingWrite.resolve();

    await expect(takeoverPromise).resolves.toBe(true);
    expect(pendingWriteOperation).toHaveBeenCalledTimes(1);
    expect(statusBeforePendingSettles).toBe('read-only');
    owner.dispose();
    next.dispose();
  });

  it('yieldがlease期限を越えてもheartbeatを続け、第三tabをack前にownerへしない', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const yielded = deferred();
    const owner = createCoordinator('tab-a', hub, clock);
    owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: () => yielded.promise });
    finishClaim(clock);
    const next = createCoordinator('tab-b', hub, clock, { takeoverTimeoutMs: 200 });
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    const observer = createCoordinator('tab-c', hub, clock);
    const observerHandle = observer.acquire(COURSE_ID, WORKSPACE_ID, {
      beforeYield: async () => {},
    });
    clock.advance(10);

    const takeoverPromise = nextHandle.takeover();
    clock.advance(70);
    const statesBeforeAck = [nextHandle.getSnapshot().status, observerHandle.getSnapshot().status];
    yielded.resolve();

    await expect(takeoverPromise).resolves.toBe(true);
    expect(statesBeforeAck).toEqual(['read-only', 'read-only']);
    expect(nextHandle.getSnapshot().status).toBe('owned');
    owner.dispose();
    next.dispose();
    observer.dispose();
  });

  it('takeover request受信直後から旧ownerの新規writeをcallback実行前に拒否する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const owner = createCoordinator('tab-a', hub, clock);
    const ownerHandle = owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    const next = createCoordinator('tab-b', hub, clock);
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    const takeoverPromise = nextHandle.takeover();
    const write = vi.fn(async () => {});

    await expect(ownerHandle.runFencedWrite(write)).rejects.toThrow('編集権');
    expect(write).not.toHaveBeenCalled();
    await expect(takeoverPromise).resolves.toBe(true);
    owner.dispose();
    next.dispose();
  });

  it('write callback内で同期的にtakeoverされても、そのwriteのsettle前にackしない', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const write = deferred();
    const owner = createCoordinator('tab-a', hub, clock);
    const ownerHandle = owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    const next = createCoordinator('tab-b', hub, clock);
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    let takeoverPromise: Promise<boolean> | undefined;

    const writePromise = ownerHandle.runFencedWrite(() => {
      takeoverPromise = nextHandle.takeover();
      return write.promise;
    });
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    const statusBeforeWriteSettles = nextHandle.getSnapshot().status;
    write.resolve();
    await writePromise;
    await expect(takeoverPromise).resolves.toBe(true);

    expect(statusBeforeWriteSettles).toBe('read-only');
    owner.dispose();
    next.dispose();
  });

  it('stale claim・release、余剰property付きmessageを拒否する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const owner = createCoordinator('tab-a', hub, clock);
    const ownerHandle = owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    const staleClaim = hub.channels[0]?.postedMessages.find(
      (message) => (message as { type?: unknown }).type === 'claim',
    );
    clock.advance(5);
    const next = createCoordinator('tab-b', hub, clock);
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    await expect(nextHandle.takeover()).resolves.toBe(true);
    const staleRelease = hub.channels[0]?.postedMessages.find(
      (message) => (message as { type?: unknown }).type === 'release',
    );

    hub.channels[1]?.receive(staleClaim);
    hub.channels[1]?.receive(staleRelease);
    hub.channels[1]?.receive({ ...(staleClaim as object), unexpected: true });

    expect(nextHandle.getSnapshot().status).toBe('owned');
    expect(ownerHandle.getSnapshot().status).toBe('released');
    owner.dispose();
    next.dispose();
  });

  it('heartbeatが途絶えてleaseがexpireすると待機tabが再claimする', () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const owner = createCoordinator('tab-a', hub, clock);
    owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    const waiting = createCoordinator('tab-b', hub, clock);
    const waitingHandle = waiting.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    hub.channels[0]?.close();

    clock.advance(80);

    expect(waitingHandle.getSnapshot().status).toBe('owned');
    owner.dispose();
    waiting.dispose();
  });

  it('disposeでrelease・timer・channelをcleanupし、以後のacquireを拒否する', () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const coordinator = createCoordinator('tab-a', hub, clock);
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);

    coordinator.dispose();

    expect(handle.getSnapshot().status).toBe('released');
    expect(hub.channels).toHaveLength(0);
    expect(clock.pendingCount()).toBe(0);
    expect(() =>
      coordinator.acquire('other', 'workspace', { beforeYield: async () => {} }),
    ).toThrow('disposed');
  });

  it('channel・storage API失敗時は単一tab編集を許可しcoordination unavailableを示す', async () => {
    const clock = new FakeClock();
    const blockedStorage = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage blocked');
      },
    } as unknown as Storage;
    const coordinator = new TabLeaseCoordinator({
      storage: blockedStorage,
      channelFactory: () => {
        throw new Error('channel blocked');
      },
      now: () => clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      idFactory: () => 'fallback-id',
    });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });

    expect(handle.getSnapshot()).toMatchObject({
      status: 'owned',
      coordination: 'unavailable',
    });
    await expect(handle.runFencedWrite(async (token) => token)).resolves.toBe('fallback-id');
    coordinator.dispose();
  });

  it('channel不能でもIndexedDB ownerをclaimし、unavailable表示のままheartbeatを続ける', async () => {
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', new BroadcastHub(), clock, {
      channelFactory: () => {
        throw new Error('channel blocked');
      },
      leasePersistence: persistence,
    });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    expect(handle.getSnapshot()).toMatchObject({
      status: 'claiming',
      coordination: 'unavailable',
    });
    finishClaim(clock);
    await flushPromises();
    expect(handle.getSnapshot()).toMatchObject({
      status: 'owned',
      coordination: 'unavailable',
    });

    for (let index = 0; index < 3; index += 1) {
      clock.advance(20);
      await flushPromises();
    }
    await expect(
      handle.runFencedWrite(async (_token, proof) => {
        persistence.assertWrite(proof);
      }),
    ).resolves.toBeUndefined();
    coordinator.dispose();
  });

  it('永続lease claim自体が失敗したらpersistent ownedと別のlocal-rescueへ分離する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    persistence.rejectClaims();
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });

    finishClaim(clock);
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({
      status: 'local-rescue',
      coordination: 'unavailable',
    });
    await expect(handle.runFencedWrite(async (_token, proof) => proof.dataEpoch)).resolves.toBe(0);

    persistence.replaceAll();
    persistence.allowClaims();
    await expect(
      handle.runFencedWrite(async () => {
        throw new LeaseFenceRejectedError();
      }),
    ).rejects.toBeInstanceOf(LeaseFenceRejectedError);
    await flushPromises();
    finishClaim(clock);
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({ status: 'owned', coordination: 'available' });
    await expect(
      handle.runFencedWrite(async (_token, proof) => {
        persistence.assertWrite(proof);
        return proof.dataEpoch;
      }),
    ).resolves.toBe(1);
    coordinator.dispose();
  });

  it('永続claimが両tabで失敗してもどちらもpersistent ownedとは表現しない', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    persistence.rejectClaims();
    const first = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const second = createCoordinator('tab-b', hub, clock, { leasePersistence: persistence });
    const firstHandle = first.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    const secondHandle = second.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });

    finishClaim(clock);
    await flushPromises();

    expect(firstHandle.getSnapshot().status).toBe('local-rescue');
    expect(secondHandle.getSnapshot().status).toBe('local-rescue');
    expect(firstHandle.getSnapshot().status).not.toBe('owned');
    expect(secondHandle.getSnapshot().status).not.toBe('owned');
    first.dispose();
    second.dispose();
  });

  it('local-rescueから永続調停へ戻るfocusでもpending flushをsettleしてからCAS claimする', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const lifecycleTarget = new EventTarget();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const flushGate = deferred();
    const flushed = vi.fn();
    persistence.rejectClaims();
    const coordinator = createCoordinator('tab-a', hub, clock, {
      leasePersistence: persistence,
      lifecycleTarget,
      isVisible: () => true,
    });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, {
      beforeYield: async (yieldFence) => {
        await yieldFence(async () => {
          flushed();
          await flushGate.promise;
        });
      },
    });
    finishClaim(clock);
    await flushPromises();
    expect(handle.getSnapshot().status).toBe('local-rescue');
    persistence.allowClaims();

    lifecycleTarget.dispatchEvent(new Event('focus'));
    expect(handle.getSnapshot().status).toBe('yielding');
    await flushPromises();
    expect(flushed).toHaveBeenCalledOnce();
    flushGate.resolve();
    await flushPromises();
    finishClaim(clock);
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({ status: 'owned', ownerId: 'tab-a-1' });
    coordinator.dispose();
  });

  it('local-rescueをreleaseするときもpending flushをsettleしてから編集権を閉じる', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const flushGate = deferred();
    const flushed = vi.fn();
    persistence.rejectClaims();
    const coordinator = createCoordinator('tab-a', hub, clock, {
      leasePersistence: persistence,
    });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, {
      beforeYield: async (yieldFence) => {
        await yieldFence(async () => {
          flushed();
          await flushGate.promise;
        });
      },
    });
    finishClaim(clock);
    await flushPromises();
    expect(handle.getSnapshot().status).toBe('local-rescue');

    const release = handle.release();
    expect(handle.getSnapshot().status).toBe('yielding');
    await flushPromises();
    expect(flushed).toHaveBeenCalledOnce();
    expect(handle.getSnapshot().status).toBe('yielding');

    flushGate.resolve();
    await release;

    expect(handle.getSnapshot().status).toBe('released');
    coordinator.dispose();
  });

  it('Broadcast配送を全欠落させてもIndexedDB CASで永続ownerを1件だけにする', async () => {
    const hub = new BroadcastHub();
    hub.droppedTypes.add('claim');
    hub.droppedTypes.add('heartbeat');
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const first = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const second = createCoordinator('tab-b', hub, clock, { leasePersistence: persistence });
    const firstHandle = first.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    const secondHandle = second.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });

    finishClaim(clock);
    await flushPromises();

    expect(
      [firstHandle, secondHandle].filter((handle) => handle.getSnapshot().status === 'owned'),
    ).toHaveLength(1);
    first.dispose();
    second.dispose();
  });

  it('suspend中に期限切れ・別ownerへ移った旧proofのwriteを永続正本で拒否する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const owner = handle.getSnapshot();
    clock.now = owner.expiresAt!;
    persistence.forceOwner({
      courseId: COURSE_ID,
      workspaceId: WORKSPACE_ID,
      ownerId: 'tab-b-owner',
      token: 'tab-b-token',
      dataEpoch: 0,
      expiresAt: clock.now + 60,
    });

    await expect(
      handle.runFencedWrite(async (_token, proof) => {
        persistence.assertWrite(proof);
      }),
    ).rejects.toBeInstanceOf(LeaseFenceRejectedError);
    coordinator.dispose();
  });

  it('fence拒否は即再検証するがCourse version conflictではownedを維持する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();

    await expect(
      handle.runFencedWrite(async () => {
        throw new CourseProgressVersionConflictError();
      }),
    ).rejects.toBeInstanceOf(CourseProgressVersionConflictError);
    expect(handle.getSnapshot().status).toBe('owned');

    persistence.forceOwner({
      courseId: COURSE_ID,
      workspaceId: WORKSPACE_ID,
      ownerId: 'tab-b-owner',
      token: 'tab-b-token',
      dataEpoch: 0,
      expiresAt: clock.now + 60,
    });
    const rejected = handle.runFencedWrite(async () => {
      throw new LeaseFenceRejectedError();
    });
    await expect(rejected).rejects.toBeInstanceOf(LeaseFenceRejectedError);
    await expect(handle.runFencedWrite(async () => undefined)).rejects.toThrow('編集権');
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({ status: 'read-only', ownerId: 'tab-b-owner' });
    coordinator.dispose();
  });

  it('ImportでdataEpochが変わった旧tabはleaseを自動再claimせずreleasedへ止める', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    persistence.replaceAll();

    await expect(
      handle.runFencedWrite(async (_token, proof) => {
        persistence.assertWrite(proof);
      }),
    ).rejects.toBeInstanceOf(LeaseFenceRejectedError);
    await flushPromises();
    clock.advance(10);
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({ status: 'released' });
    await expect(persistence.readWorkspaceLease(COURSE_ID, WORKSPACE_ID)).resolves.toBeUndefined();
    coordinator.dispose();
  });

  it('同じdataEpoch内の単なるlease期限切れならexpected CASで再取得する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const lifecycleTarget = new EventTarget();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, {
      leasePersistence: persistence,
      lifecycleTarget,
      isVisible: () => true,
    });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    clock.now = handle.getSnapshot().expiresAt!;

    lifecycleTarget.dispatchEvent(new Event('focus'));
    await flushPromises();
    clock.advance(10);
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({ status: 'owned' });
    coordinator.dispose();
  });

  it('focusで即新規writeを閉じ、pending flushをsettleしてからowner不一致へ収束する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const lifecycleTarget = new EventTarget();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const flushGate = deferred();
    const flushed = vi.fn();
    const coordinator = createCoordinator('tab-a', hub, clock, {
      leasePersistence: persistence,
      lifecycleTarget,
      isVisible: () => true,
    });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, {
      beforeYield: async (yieldFence) => {
        await yieldFence(async (_token, proof) => {
          persistence.assertWrite(proof);
          flushed();
          await flushGate.promise;
        });
      },
    });
    finishClaim(clock);
    await flushPromises();
    lifecycleTarget.dispatchEvent(new Event('focus'));
    expect(handle.getSnapshot().status).toBe('yielding');
    await flushPromises();
    expect(flushed).toHaveBeenCalledOnce();
    await expect(handle.runFencedWrite(async () => undefined)).rejects.toThrow('編集権');
    expect(handle.getSnapshot().status).toBe('yielding');
    persistence.forceOwner({
      courseId: COURSE_ID,
      workspaceId: WORKSPACE_ID,
      ownerId: 'tab-b-owner',
      token: 'tab-b-token',
      dataEpoch: 0,
      expiresAt: clock.now + 60,
    });
    flushGate.resolve();
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({ status: 'read-only', ownerId: 'tab-b-owner' });
    coordinator.dispose();
  });

  it('in-flight write中のfocusも即度新規writeを閉じ、settle後にself leaseを必ず再検証する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const lifecycleTarget = new EventTarget();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const writeGate = deferred();
    const coordinator = createCoordinator('tab-a', hub, clock, {
      leasePersistence: persistence,
      lifecycleTarget,
      isVisible: () => true,
    });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const writing = handle.runFencedWrite(async (_token, proof) => {
      await writeGate.promise;
      persistence.assertWrite(proof);
    });

    lifecycleTarget.dispatchEvent(new Event('focus'));
    expect(handle.getSnapshot().status).toBe('yielding');
    await expect(handle.runFencedWrite(async () => undefined)).rejects.toThrow('編集権');
    writeGate.resolve();

    await expect(writing).resolves.toBeUndefined();
    await flushPromises();
    expect(handle.getSnapshot()).toMatchObject({ status: 'owned', ownerId: 'tab-a-1' });
    expect(persistence.heartbeatCount).toBeGreaterThan(0);
    coordinator.dispose();
  });

  it('Broadcast通知前に永続ownerが変わったら旧proofのpending処理を開始せずread-onlyへ移る', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const flushed = vi.fn();
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, {
      beforeYield: (yieldFence) =>
        yieldFence(async () => {
          flushed();
        }),
    });
    finishClaim(clock);
    await flushPromises();
    persistence.forceOwner({
      courseId: COURSE_ID,
      workspaceId: WORKSPACE_ID,
      ownerId: 'tab-b-owner',
      token: 'tab-b-token',
      dataEpoch: 0,
      expiresAt: clock.now + 60,
    });
    const external = hub.connect('tsumucode-editing');

    external.postMessage({
      version: 1,
      type: 'heartbeat',
      courseId: COURSE_ID,
      workspaceId: WORKSPACE_ID,
      senderId: 'tab-b-owner',
      token: 'tab-b-token',
      sentAt: clock.now,
      expiresAt: clock.now + 60,
    });
    await flushPromises();
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({ status: 'read-only', ownerId: 'tab-b-owner' });
    expect(flushed).not.toHaveBeenCalled();
    external.close();
    coordinator.dispose();
  });

  it('focusとpageshowが連続しても永続self proofを採用してownedへ復帰する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const lifecycleTarget = new EventTarget();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, {
      leasePersistence: persistence,
      lifecycleTarget,
      isVisible: () => true,
    });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();

    lifecycleTarget.dispatchEvent(new Event('focus'));
    lifecycleTarget.dispatchEvent(new Event('pageshow'));
    expect(handle.getSnapshot().status).toBe('yielding');
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({ status: 'owned', ownerId: 'tab-a-1' });
    coordinator.dispose();
  });

  it('永続claim成功のcontinuation前にBC通知が届いてもself ownerへ収束する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });

    finishClaim(clock);
    hub.channels[0]?.receive({
      version: 1,
      type: 'heartbeat',
      courseId: COURSE_ID,
      workspaceId: WORKSPACE_ID,
      senderId: 'tab-notifier',
      token: 'notification-only',
      sentAt: clock.now,
      expiresAt: clock.now + 60,
    });
    await flushPromises();

    expect(handle.getSnapshot()).toMatchObject({ status: 'owned', ownerId: 'tab-a-1' });
    coordinator.dispose();
  });

  it('yielding中のfocus再検証はstatusを維持し、settle後に永続releaseを完遂する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const lifecycleTarget = new EventTarget();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const settle = deferred();
    const owner = createCoordinator('tab-a', hub, clock, {
      leasePersistence: persistence,
      lifecycleTarget,
      isVisible: () => true,
    });
    const ownerHandle = owner.acquire(COURSE_ID, WORKSPACE_ID, {
      beforeYield: () => settle.promise,
    });
    finishClaim(clock);
    await flushPromises();
    const next = createCoordinator('tab-b', hub, clock, { leasePersistence: persistence });
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    await flushPromises();

    const takeover = nextHandle.takeover();
    expect(ownerHandle.getSnapshot().status).toBe('yielding');
    lifecycleTarget.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(ownerHandle.getSnapshot().status).toBe('yielding');
    settle.resolve();

    await expect(takeover).resolves.toBe(true);
    expect(ownerHandle.getSnapshot().status).toBe('released');
    expect(nextHandle.getSnapshot().status).toBe('owned');
    owner.dispose();
    next.dispose();
  });

  it('takeover中のheartbeat完了を待ち、最新proofでreleaseしてackする', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const owner = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const ownerHandle = owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const next = createCoordinator('tab-b', hub, clock, { leasePersistence: persistence });
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    await flushPromises();
    const heartbeatGate = deferred();
    persistence.deferNextHeartbeat(heartbeatGate.promise);
    clock.advance(20);

    const takeover = nextHandle.takeover();
    expect(ownerHandle.getSnapshot().status).toBe('yielding');
    await flushPromises();
    expect(nextHandle.getSnapshot().status).toBe('read-only');
    heartbeatGate.resolve();

    await expect(takeover).resolves.toBe(true);
    expect(ownerHandle.getSnapshot().status).toBe('released');
    expect(nextHandle.getSnapshot().status).toBe('owned');
    owner.dispose();
    next.dispose();
  });

  it('開始済みheartbeatの完了を待ち、更新後の最新proofでfenced writeを開始する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const heartbeatGate = deferred();
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    persistence.deferNextHeartbeat(heartbeatGate.promise);
    clock.advance(20);
    const write = vi.fn(async (_token: string, proof: WorkspaceLeaseProof) => proof);

    const writing = handle.runFencedWrite(write);
    await flushPromises();
    expect(write).not.toHaveBeenCalled();
    heartbeatGate.resolve();

    const proof = await writing;
    expect(write).toHaveBeenCalledOnce();
    expect(proof.expiresAt).toBe(clock.now + 60);
    persistence.assertWrite(proof);
    coordinator.dispose();
  });

  it('期限直前のfenced writeはCAS heartbeatでproofを延長してから開始する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const initialExpiry = handle.getSnapshot().expiresAt!;
    const heartbeatCountBeforeWrite = persistence.heartbeatCount;
    clock.now = initialExpiry - 1;

    const proof = await handle.runFencedWrite(async (_token, currentProof) => currentProof);

    expect(persistence.heartbeatCount).toBe(heartbeatCountBeforeWrite + 1);
    expect(proof.expiresAt).toBe(clock.now + 60);
    persistence.assertWrite(proof);
    coordinator.dispose();
  });

  it('同時に要求した永続fenced writeを開始順に直列実行する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const firstGate = deferred();
    const events: string[] = [];

    const first = handle.runFencedWrite(async () => {
      events.push('first:start');
      await firstGate.promise;
      events.push('first:end');
    });
    const second = handle.runFencedWrite(() => {
      events.push('second:start');
    });
    await flushPromises();

    expect(events).toEqual(['first:start']);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    coordinator.dispose();
  });

  it('先行する永続fenced writeが失敗しても後続writeを開始する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const events: string[] = [];

    const failed = handle.runFencedWrite(() => {
      events.push('first:failed');
      throw new Error('expected write failure');
    });
    const recovered = handle.runFencedWrite(() => {
      events.push('second:started');
    });

    await expect(failed).rejects.toThrow('expected write failure');
    await expect(recovered).resolves.toBeUndefined();
    expect(events).toEqual(['first:failed', 'second:started']);
    coordinator.dispose();
  });

  it('保存直前のheartbeat後はwrite中に更新せず、同じproofをCAS完了まで維持する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const writeGate = deferred();
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const heartbeatCountBeforeWrite = persistence.heartbeatCount;
    const writing = handle.runFencedWrite(async (_token, proof) => {
      await writeGate.promise;
      persistence.assertWrite(proof);
    });
    await flushPromises();
    const heartbeatCountAtWriteStart = persistence.heartbeatCount;
    expect(heartbeatCountAtWriteStart).toBe(heartbeatCountBeforeWrite + 1);

    clock.advance(20);
    await flushPromises();
    expect(persistence.heartbeatCount).toBe(heartbeatCountAtWriteStart);
    writeGate.resolve();

    await expect(writing).resolves.toBeUndefined();
    coordinator.dispose();
  });

  it('fenced write中に外部probeが届いても永続heartbeatを開始しない', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const writeGate = deferred();
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const heartbeatCountBeforeWrite = persistence.heartbeatCount;
    const writing = handle.runFencedWrite(async (_token, proof) => {
      await writeGate.promise;
      persistence.assertWrite(proof);
    });
    await flushPromises();
    const heartbeatCountAtWriteStart = persistence.heartbeatCount;
    expect(heartbeatCountAtWriteStart).toBe(heartbeatCountBeforeWrite + 1);
    const external = hub.connect('tsumucode-editing');

    external.postMessage({
      version: 1,
      type: 'probe',
      courseId: COURSE_ID,
      workspaceId: WORKSPACE_ID,
      senderId: 'tab-b',
      requestId: 'external-probe',
      sentAt: clock.now,
    });
    await flushPromises();

    expect(persistence.heartbeatCount).toBe(heartbeatCountAtWriteStart);
    writeGate.resolve();
    await expect(writing).resolves.toBeUndefined();
    external.close();
    coordinator.dispose();
  });

  it('明示release中のheartbeat完了を待ち、最新proofで永続ownerを削除する', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const coordinator = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const handle = coordinator.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const heartbeatGate = deferred();
    persistence.deferNextHeartbeat(heartbeatGate.promise);
    clock.advance(20);

    const releasing = handle.release();
    await flushPromises();
    heartbeatGate.resolve();
    await releasing;

    await expect(persistence.readWorkspaceLease(COURSE_ID, WORKSPACE_ID)).resolves.toBeUndefined();
    expect(handle.getSnapshot().status).toBe('released');
    coordinator.dispose();
  });

  it('releaseだけ届きackが欠落してもtimeout後に永続ownerを再読込してclaimする', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const owner = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    const ownerHandle = owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const next = createCoordinator('tab-b', hub, clock, { leasePersistence: persistence });
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    await flushPromises();
    hub.droppedTypes.add('yield-ack');

    const takeover = nextHandle.takeover();
    await flushPromises();
    expect(ownerHandle.getSnapshot().status).toBe('released');
    clock.advance(80);
    await flushPromises();

    await expect(takeover).resolves.toBe(true);
    expect(nextHandle.getSnapshot().status).toBe('owned');
    expect(persistence.readCount).toBeGreaterThan(0);
    owner.dispose();
    next.dispose();
  });

  it('takeover再検証で同じownerIdでもpending newTokenと異なるproofはself扱いしない', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const owner = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const next = createCoordinator('tab-b', hub, clock, {
      leasePersistence: persistence,
      takeoverTimeoutMs: 5,
    });
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    await flushPromises();
    hub.droppedTypes.add('takeover-request');

    const takeover = nextHandle.takeover();
    persistence.forceOwner({
      courseId: COURSE_ID,
      workspaceId: WORKSPACE_ID,
      ownerId: 'tab-b-1',
      token: 'cloned-tab-token',
      dataEpoch: 0,
      expiresAt: clock.now + 100,
    });
    clock.advance(5);
    await flushPromises();

    await expect(takeover).resolves.toBe(false);
    expect(nextHandle.getSnapshot()).toMatchObject({
      status: 'read-only',
      ownerId: 'tab-b-1',
    });
    owner.dispose();
    next.dispose();
  });

  it('takeoverのpending newTokenが一致してもepoch bind失敗後はtrue解決しない', async () => {
    const hub = new BroadcastHub();
    const clock = new FakeClock();
    const persistence = new SharedLeasePersistence(() => clock.now);
    const owner = createCoordinator('tab-a', hub, clock, { leasePersistence: persistence });
    owner.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    finishClaim(clock);
    await flushPromises();
    const issuedIds: string[] = [];
    let sequence = 0;
    const next = createCoordinator('ignored', hub, clock, {
      leasePersistence: persistence,
      takeoverTimeoutMs: 5,
      idFactory: () => {
        const id = `tab-b-${String(++sequence)}`;
        issuedIds.push(id);
        return id;
      },
    });
    const nextHandle = next.acquire(COURSE_ID, WORKSPACE_ID, { beforeYield: async () => {} });
    clock.advance(10);
    await flushPromises();
    hub.droppedTypes.add('takeover-request');

    const takeover = nextHandle.takeover();
    persistence.forceOwner({
      courseId: COURSE_ID,
      workspaceId: WORKSPACE_ID,
      ownerId: issuedIds[0]!,
      token: issuedIds.at(-1)!,
      dataEpoch: 1,
      expiresAt: clock.now + 100,
    });
    clock.advance(5);
    await flushPromises();

    await expect(takeover).resolves.toBe(false);
    expect(nextHandle.getSnapshot()).toMatchObject({ status: 'released' });
    owner.dispose();
    next.dispose();
  });
});
