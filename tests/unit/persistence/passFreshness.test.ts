import { describe, expect, it } from 'vitest';
import { PassFreshnessRegistry } from '../../../src/core/persistence/PassFreshnessRegistry';

const COURSE_ID = 'html-css';
const WORKSPACE_ID = 'workspace-profile';
const EXERCISE_IDS = Array.from({ length: 5 }, (_, index) => `exercise-step-${String(index + 1)}`);

/** sessionStorage相当の同期Storageをinstance間で共有する。 */
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

/** native BroadcastChannelの必要部分を再現し、複数Registry間のmessageを同期配送する。 */
class FakeBroadcastChannel {
  readonly name: string;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly postedMessages: unknown[] = [];
  readonly #hub: BroadcastHub;
  readonly #listeners = new Set<(event: MessageEvent<unknown>) => void>();
  #closed = false;
  #throwOnPost = false;

  constructor(hub: BroadcastHub, name: string, throwOnPost = false) {
    this.#hub = hub;
    this.name = name;
    this.#throwOnPost = throwOnPost;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'message') return;
    this.#listeners.add((event) => {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    });
  }

  close(): void {
    this.#closed = true;
    this.#hub.disconnect(this);
  }

  postMessage(message: unknown): void {
    if (this.#throwOnPost) throw new Error('BroadcastChannel post blocked');
    if (this.#closed) throw new Error('BroadcastChannel is closed');
    this.postedMessages.push(message);
    this.#hub.broadcast(this, message);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'message') return;
    for (const registered of this.#listeners) {
      if (registered === listener) this.#listeners.delete(registered);
    }
  }

  /** Testから任意payloadを受信させる。close後はnative同様に配送しない。 */
  receive(message: unknown): void {
    if (this.#closed) return;
    const event = new MessageEvent('message', { data: message });
    this.onmessage?.(event);
    for (const listener of this.#listeners) listener(event);
  }
}

/** 同じnameのFakeBroadcastChannelだけを接続するTest hub。 */
class BroadcastHub {
  readonly channels: FakeBroadcastChannel[] = [];

  connect(name: string, throwOnPost = false): FakeBroadcastChannel {
    const channel = new FakeBroadcastChannel(this, name, throwOnPost);
    this.channels.push(channel);
    return channel;
  }

  disconnect(channel: FakeBroadcastChannel): void {
    const index = this.channels.indexOf(channel);
    if (index >= 0) this.channels.splice(index, 1);
  }

  broadcast(sender: FakeBroadcastChannel, message: unknown): void {
    for (const channel of this.channels) {
      if (channel !== sender && channel.name === sender.name) channel.receive(message);
    }
  }
}

/** Registryへ注入できるnative互換factoryへ型を限定して返す。 */
function channelFactory(hub: BroadcastHub, throwOnPost = false) {
  return (name: string) => hub.connect(name, throwOnPost) as unknown as BroadcastChannel;
}

describe('PassFreshnessRegistry', () => {
  it('編集callbackと同じ同期turnで共有workspaceの全Exerciseをdirtyにする', () => {
    const registry = new PassFreshnessRegistry({
      storage: new MemoryStorage(),
      channelFactory: channelFactory(new BroadcastHub()),
    });

    registry.markDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS, 5);

    expect(
      EXERCISE_IDS.map((exerciseId) => registry.isDirty(COURSE_ID, WORKSPACE_ID, exerciseId)),
    ).toEqual([true, true, true, true, true]);
    registry.dispose();
  });

  it('同じsessionStorageからExercise別dirty revisionを復元する', () => {
    const storage = new MemoryStorage();
    const hub = new BroadcastHub();
    const first = new PassFreshnessRegistry({
      storage,
      channelFactory: channelFactory(hub),
    });
    first.markDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS, 5);
    first.dispose();

    const restored = new PassFreshnessRegistry({
      storage,
      channelFactory: channelFactory(hub),
    });

    expect(
      EXERCISE_IDS.map((exerciseId) => restored.isDirty(COURSE_ID, WORKSPACE_ID, exerciseId)),
    ).toEqual([true, true, true, true, true]);
    restored.dispose();
  });

  it('BroadcastChannelを通して別instanceへdirtyとpassを同期する', () => {
    const hub = new BroadcastHub();
    const sender = new PassFreshnessRegistry({
      storage: new MemoryStorage(),
      channelFactory: channelFactory(hub),
    });
    const receiver = new PassFreshnessRegistry({
      storage: new MemoryStorage(),
      channelFactory: channelFactory(hub),
    });

    sender.markDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS, 5);
    expect(receiver.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[0]!)).toBe(true);

    sender.markPassed(COURSE_ID, WORKSPACE_ID, [EXERCISE_IDS[0]!], 5);
    expect(receiver.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[0]!)).toBe(false);
    expect(receiver.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[1]!)).toBe(true);

    sender.dispose();
    receiver.dispose();
  });

  it('別Exercise・古いrevision・新しいrevisionでは消さず、同じExerciseの同revisionだけを消す', () => {
    const registry = new PassFreshnessRegistry({
      storage: new MemoryStorage(),
      channelFactory: channelFactory(new BroadcastHub()),
    });
    registry.markDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS, 5);

    registry.markPassed(COURSE_ID, WORKSPACE_ID, ['exercise-foreign'], 5);
    registry.markPassed(COURSE_ID, WORKSPACE_ID, [EXERCISE_IDS[0]!], 4);
    registry.markPassed(COURSE_ID, WORKSPACE_ID, [EXERCISE_IDS[1]!], 6);

    expect(registry.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[0]!)).toBe(true);
    expect(registry.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[1]!)).toBe(true);

    registry.markPassed(COURSE_ID, WORKSPACE_ID, [EXERCISE_IDS[0]!], 5);

    expect(registry.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[0]!)).toBe(false);
    expect(
      EXERCISE_IDS.slice(1).map((exerciseId) =>
        registry.isDirty(COURSE_ID, WORKSPACE_ID, exerciseId),
      ),
    ).toEqual([true, true, true, true]);
    registry.dispose();
  });

  it('sessionStorageとchannelのAPIが失敗しても同期memory guardを保持する', () => {
    const blockedStorage = new MemoryStorage();
    blockedStorage.getItem = () => {
      throw new Error('sessionStorage blocked');
    };
    blockedStorage.setItem = () => {
      throw new Error('sessionStorage blocked');
    };
    const registry = new PassFreshnessRegistry({
      storage: blockedStorage,
      channelFactory: channelFactory(new BroadcastHub(), true),
    });

    expect(() => {
      registry.markDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS, 5);
    }).not.toThrow();
    expect(registry.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[4]!)).toBe(true);
    registry.dispose();
  });

  it('versioned message schemaに合わないpayloadを全て拒否する', () => {
    const senderHub = new BroadcastHub();
    const sender = new PassFreshnessRegistry({
      storage: new MemoryStorage(),
      channelFactory: channelFactory(senderHub),
    });
    sender.markDirty(COURSE_ID, WORKSPACE_ID, [EXERCISE_IDS[0]!], 5);
    const validMessage = senderHub.channels[0]!.postedMessages[0];
    expect(validMessage).toBeDefined();
    sender.dispose();

    const receiverHub = new BroadcastHub();
    const receiver = new PassFreshnessRegistry({
      storage: new MemoryStorage(),
      channelFactory: channelFactory(receiverHub),
    });
    const channel = receiverHub.channels[0]!;
    const invalidMessages: unknown[] = [
      null,
      {},
      { ...(validMessage as object), version: 2 },
      { ...(validMessage as object), type: 'unknown' },
      { ...(validMessage as object), revision: -1 },
      { ...(validMessage as object), courseId: '' },
      { ...(validMessage as object), exerciseIds: [EXERCISE_IDS[0], 7] },
      { ...(validMessage as object), unexpected: true },
    ];

    for (const message of invalidMessages) channel.receive(message);
    expect(receiver.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[0]!)).toBe(false);

    channel.receive(validMessage);
    expect(receiver.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[0]!)).toBe(true);
    receiver.dispose();
  });

  it('dispose後はchannel messageを受信しない', () => {
    const hub = new BroadcastHub();
    const sender = new PassFreshnessRegistry({
      storage: new MemoryStorage(),
      channelFactory: channelFactory(hub),
    });
    const receiver = new PassFreshnessRegistry({
      storage: new MemoryStorage(),
      channelFactory: channelFactory(hub),
    });
    receiver.dispose();

    sender.markDirty(COURSE_ID, WORKSPACE_ID, [EXERCISE_IDS[0]!], 5);

    expect(receiver.isDirty(COURSE_ID, WORKSPACE_ID, EXERCISE_IDS[0]!)).toBe(false);
    sender.dispose();
  });
});
