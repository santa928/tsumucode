import type {
  ExecutionRequest,
  ExecutionPreparationProgress,
} from '../../../src/core/runtime/contracts';
import { PythonExecutionService } from '../../../src/adapters/runtime/python/PythonExecutionService';
import type { PythonCore } from '../../../src/adapters/runtime/python/pythonProtocol';
import { selectBrowserConsoleRuntime } from '../../../src/features/learning/pythonRuntime';

export type PreparationRace = 'cancel' | 'replace' | 'dispose' | 'timeout';

function request(revision: number): ExecutionRequest {
  return {
    runId: `cache-run-${String(revision)}`,
    exerciseSessionId: 'cache-race-session',
    executionRevision: revision,
    backend: 'browser',
    engine: 'browser-python',
    languageId: 'python',
    requiredCapabilities: ['console'],
    files: { 'main.py': 'count = 2\nprint(count + 3)\n' },
    options: {},
  };
}

/** 固定生成物を使う制御loader用Fixture。製品loaderの照合は別試験で確認する。 */
async function fixedFixture(): Promise<PythonCore> {
  const asset = (name: string) =>
    fetch(
      new URL(`python-runtime/314.0.7/${name}`, new URL(import.meta.env.BASE_URL, location.origin)),
    );
  const [wasm, stdlib, lock, worker] = await Promise.all([
    asset('core.wasm').then((response) => response.arrayBuffer()),
    asset('stdlib.zip').then((response) => response.arrayBuffer()),
    asset('lock.json').then((response) => response.json() as Promise<Record<string, unknown>>),
    asset('worker.js').then((response) => response.text()),
  ]);
  return { wasm, stdlib, lock, workerSource: worker };
}

/** abortを意図的に無視する旧loaderの後着も、実frame/Workerへ反映しないことを調べる。 */
export async function exercisePreparationRace(mode: PreparationRace) {
  const core = await fixedFixture();
  let release!: (value: PythonCore) => void;
  let started!: () => void;
  const pendingCore = new Promise<PythonCore>((resolve) => {
    release = resolve;
  });
  const loading = new Promise<void>((resolve) => {
    started = resolve;
  });
  let loads = 0;
  let firstSignal: AbortSignal | undefined;
  const service = new PythonExecutionService(async (signal) => {
    loads += 1;
    if (loads === 1) {
      firstSignal = signal;
      started();
      return pendingCore;
    }
    return core;
  });
  // このcoreが後着で誤登録されると、次の実Workerが失敗する。
  const staleCore = { ...core, workerSource: 'throw new Error("旧coreを利用しました");' };
  const began = performance.now();
  const oldRun = service.execute(request(1));
  await loading;
  const preparingFrames = document.querySelectorAll('iframe').length;
  let first;
  let firstElapsed: number;
  let retry;
  let recreated;
  let recreatedLoads = 0;
  try {
    if (mode === 'dispose') {
      // Promise完了とdisposeを同じturnに置き、await再開より先に世代を失効する。
      release(core);
      await service.dispose();
      first = await oldRun;
      firstElapsed = performance.now() - began;
      retry = await service.execute(request(2));
      const nextService = new PythonExecutionService(async () => {
        recreatedLoads += 1;
        return core;
      });
      try {
        recreated = await nextService.execute(request(4));
      } finally {
        await nextService.dispose();
      }
    } else {
      if (mode === 'cancel') await service.stop();
      if (mode === 'replace') retry = await service.execute(request(2));
      first = await oldRun;
      firstElapsed = performance.now() - began;
      if (retry === undefined) retry = await service.execute(request(2));
      release(staleCore);
      // 旧loaderのPromise連鎖を終え、次runによる上書きが誤登録を隠さないようにする。
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const warm = await service.execute(request(3));
    return {
      first,
      retry,
      warm,
      recreated,
      recreatedLoads,
      loads,
      aborted: firstSignal?.aborted,
      elapsed: performance.now() - began,
      firstElapsed,
      preparingFrames,
      frames: document.querySelectorAll('iframe').length,
    };
  } finally {
    release(staleCore);
    await service.dispose();
  }
}

/** 製品factoryのloaderで拒否したassetを保持せず、次の要求を新しく取得する。 */
function productionService(reportProgress?: (progress: ExecutionPreparationProgress) => void) {
  const exercise = {
    id: 'python-basics-ch01-l01-e01',
    runtime: {
      kind: 'python' as const,
      profile: 'values-vars-print-v1' as const,
      entryFile: 'main.py' as const,
      sourceType: 'script' as const,
      capabilityProfile: 'core' as const,
      primaryOutput: 'console' as const,
    },
    validationRules: [],
    interactionScenarios: [],
  };
  return selectBrowserConsoleRuntime(exercise, [exercise]).createExecution(
    undefined,
    reportProgress,
  );
}

export async function exerciseLoaderRecovery() {
  const service = productionService();
  try {
    const failed = await service.execute(request(1));
    const failedFrames = document.querySelectorAll('iframe').length;
    const retry = await service.execute(request(2));
    const warm = await service.execute(request(3));
    return {
      failed,
      failedFrames,
      retry,
      warm,
      frames: document.querySelectorAll('iframe').length,
    };
  } finally {
    await service.dispose();
  }
}

/** 製品streamの途中で取消し、後着通知を止めて未保持のcoreを取り直す。 */
export async function exerciseProgressCancellation() {
  const events: ExecutionPreparationProgress[] = [];
  let stoppedAt = 0;
  let cancelling = false;
  const service = productionService((progress) => {
    events.push(progress);
    if (!cancelling && progress.runId === 'cache-run-1' && progress.receivedBytes > 0) {
      cancelling = true;
      stoppedAt = events.length;
      void service.stop();
    }
  });
  try {
    const first = await service.execute(request(1));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const oldEvents = events.filter((event) => event.runId === 'cache-run-1');
    const framesAfterStop = document.querySelectorAll('iframe').length;
    const retry = await service.execute(request(2));
    return { first, retry, oldEvents, stoppedAt, framesAfterStop, events };
  } finally {
    await service.dispose();
  }
}

/** timer callbackがまだ動かなくても、期限後の照合・登録を拒否する単調clock境界試験。 */
export async function exerciseClockBoundary(
  boundary: 'source' | 'source-timer' | 'assets' | 'registration',
) {
  const core = await fixedFixture();
  const digestDescriptor = Object.getOwnPropertyDescriptor(crypto.subtle, 'digest');
  const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  const nowDescriptor = Object.getOwnPropertyDescriptor(performance, 'now');
  const nativeNow = performance.now.bind(performance);
  const originalSet = window.setTimeout;
  const originalClear = window.clearTimeout;
  let downloadTimer: ReturnType<typeof originalSet> | undefined;
  let offset = 0;
  let hashed!: () => void;
  let hashValue: ArrayBuffer | undefined;
  let releaseHash!: (value: ArrayBuffer) => void;
  let releaseCore!: (value: PythonCore) => void;
  const hashing = new Promise<void>((resolve) => {
    hashed = resolve;
  });
  const delayedHash = new Promise<ArrayBuffer>((resolve) => {
    releaseHash = resolve;
  });
  const delayedCore = new Promise<PythonCore>((resolve) => {
    releaseCore = resolve;
  });
  let loads = 0;
  const waitingForSource = boundary === 'source' || boundary === 'source-timer';
  const service = new PythonExecutionService(async () => {
    loads += 1;
    return loads === 1 && !waitingForSource ? delayedCore : core;
  });
  const restore = (): void => {
    if (digestDescriptor === undefined) Reflect.deleteProperty(crypto.subtle, 'digest');
    else Object.defineProperty(crypto.subtle, 'digest', digestDescriptor);
    window.setTimeout = originalSet;
    window.clearTimeout = originalClear;
    if (nowDescriptor === undefined) Reflect.deleteProperty(performance, 'now');
    else Object.defineProperty(performance, 'now', nowDescriptor);
  };
  try {
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => nativeNow() + offset,
    });
    crypto.subtle.digest = (...args) =>
      nativeDigest(...args).then((value) => {
        hashValue = value;
        hashed();
        return waitingForSource ? delayedHash : value;
      });
    // Browserだけで呼ぶFixture。Node/DOMの型が重なるmethodへ関数代入せず差替える。
    Object.defineProperty(window, 'setTimeout', {
      configurable: true,
      writable: true,
      value: (callback: () => void, milliseconds?: number) => {
        const timer = originalSet.call(window, callback, milliseconds);
        if (milliseconds === 90_000) downloadTimer = timer;
        return timer;
      },
    });
    Object.defineProperty(window, 'clearTimeout', {
      configurable: true,
      writable: true,
      value: (timer: ReturnType<typeof originalSet> | undefined) => {
        originalClear.call(window, timer);
        if (boundary === 'registration' && timer === downloadTimer) offset = 90_001;
      },
    });
    const pending = service.execute(request(1));
    await hashing;
    await new Promise<void>((resolve) => originalSet.call(window, resolve, 0));
    if (boundary === 'source') {
      offset = 20_001;
      if (hashValue === undefined) throw new Error('Source hashの完了を確認できません');
      releaseHash(hashValue);
    } else if (boundary !== 'source-timer') {
      if (boundary === 'assets') offset = 90_001;
      releaseCore(core);
    }
    const began = nativeNow();
    const first = await pending;
    const elapsed = nativeNow() - began;
    const frames = document.querySelectorAll('iframe').length;
    restore();
    if (hashValue !== undefined) releaseHash(hashValue);
    const retry = await service.execute(request(2));
    return {
      boundary,
      clockReadAdjusted: boundary !== 'source-timer',
      elapsed,
      first,
      retry,
      loads,
      frames,
    };
  } finally {
    restore();
    releaseCore(core);
    if (hashValue !== undefined) releaseHash(hashValue);
    await service.dispose();
  }
}

/** 信頼Workerの応答を保留し、初期化15秒とready後1.5秒の実時計を確認する。 */
export async function exerciseRuntimeDeadline(ready: boolean) {
  const core = await fixedFixture();
  const events: ExecutionPreparationProgress[] = [];
  const service = new PythonExecutionService(
    async () => ({
      ...core,
      workerSource: ready
        ? 'self.onmessage = event => event.ports[0].postMessage({ type: "python-ready" });'
        : 'self.onmessage = () => {};',
    }),
    undefined,
    undefined,
    (progress) => {
      events.push(progress);
    },
  );
  try {
    const began = performance.now();
    const result = await service.execute(request(1));
    return {
      result,
      elapsed: performance.now() - began,
      events,
      frames: document.querySelectorAll('iframe').length,
    };
  } finally {
    await service.dispose();
  }
}
