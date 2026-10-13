import type { ExecutionRequest } from '../../../src/core/runtime/contracts';
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
export async function exerciseLoaderRecovery() {
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
  const service = selectBrowserConsoleRuntime(exercise, [exercise]).createExecution();
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
