/** Analyzer済みJavaScriptをbounded budgetと無効化済みCapability内で実行するblob source。 */
import { assertBridgeConfig } from '../../html-css/bridgeSource';

export interface CreateJavaScriptExecutionSourceInput {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly bootstrapToken: string;
  readonly guardIdentifier: string;
  readonly instrumentedCode: string;
}

const SAFE_GUARD_IDENTIFIER = /^[$A-Z_a-z][$\w]*$/u;
const MAX_INSTRUMENTED_CODE_BYTES = 200 * 1024;

interface RuntimeConfig {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly bootstrapToken: string;
}

/** iframe内の実行状態を閉包へ隔離し、学習Codeへbudget判定だけを公開する。 */
function createRuntimeState(config: RuntimeConfig) {
  'use strict';
  const version = 1;
  const maximumCheckpoints = 100_000;
  const maximumDurationMs = 250;
  const maximumTimers = 10;
  const maximumUsedRequests = 1_024;
  const parentWindow = window.parent;
  const sendToParent = parentWindow.postMessage.bind(parentWindow);
  const executingScript = document.currentScript;
  if (executingScript instanceof HTMLScriptElement) executingScript.remove();
  const now = performance.now.bind(performance);
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  const addWindowListener = window.addEventListener.bind(window);
  const timers = new Map<number, 'timeout' | 'interval'>();
  const usedRequestIds = new Set<string>();
  const usedTokens = new Set<string>();
  let checkpoints = 0;
  let startedAt = now();
  let functionDepth = 0;
  let budgetExhausted = false;
  let timerLimitExceeded = false;
  let runtimeError: { readonly name: string; readonly message: string } | null = null;

  const send = (type: string, requestId: string, oneTimeToken: string, payload: unknown): void => {
    sendToParent(
      {
        version,
        type,
        exerciseSessionId: config.exerciseSessionId,
        executionRevision: config.executionRevision,
        requestId,
        oneTimeToken,
        payload,
      },
      '*',
    );
  };

  const resetCallbackBudget = (): void => {
    checkpoints = 0;
    functionDepth = 0;
    startedAt = now();
  };

  const hasBudget = (): boolean => {
    checkpoints += 1;
    if (checkpoints > maximumCheckpoints || now() - startedAt > maximumDurationMs) {
      budgetExhausted = true;
      return false;
    }
    return true;
  };

  const errorRecord = (error: unknown): { readonly name: string; readonly message: string } => {
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error ? error.message : String(error);
    return { name: name.slice(0, 128) || 'Error', message: message.slice(0, 2_000) };
  };

  const executeCallback = (callback: (...args: unknown[]) => unknown, args: unknown[]): void => {
    resetCallbackBudget();
    try {
      Reflect.apply(callback, undefined, args);
    } catch (error: unknown) {
      runtimeError = errorRecord(error);
    }
  };

  const setBoundedTimeout = (
    callback: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ): number => {
    if (typeof callback !== 'function' || timers.size >= maximumTimers) {
      timerLimitExceeded = true;
      return 0;
    }
    let handle = 0;
    handle = nativeSetTimeout(
      () => {
        timers.delete(handle);
        executeCallback(callback as (...items: unknown[]) => unknown, args);
      },
      Number.isFinite(delay) ? Math.max(0, Number(delay)) : 0,
    );
    timers.set(handle, 'timeout');
    return handle;
  };

  const setBoundedInterval = (
    callback: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ): number => {
    if (typeof callback !== 'function' || timers.size >= maximumTimers) {
      timerLimitExceeded = true;
      return 0;
    }
    const handle = nativeSetInterval(
      () => {
        executeCallback(callback as (...items: unknown[]) => unknown, args);
      },
      Number.isFinite(delay) ? Math.max(0, Number(delay)) : 0,
    );
    timers.set(handle, 'interval');
    return handle;
  };

  const clearTrackedTimer = (handle: number): void => {
    const type = timers.get(handle);
    if (type === 'interval') nativeClearInterval(handle);
    else nativeClearTimeout(handle);
    timers.delete(handle);
  };

  const clearAllTimers = (): void => {
    for (const handle of [...timers.keys()]) clearTrackedTimer(handle);
  };

  const lockGlobal = (name: string, value: unknown): void => {
    try {
      Object.defineProperty(window, name, {
        configurable: false,
        enumerable: false,
        writable: false,
        value,
      });
    } catch {
      // opaque-originで既に利用不能なCapabilityはその状態を維持する。
    }
  };

  for (const name of [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'Worker',
    'SharedWorker',
    'WebAssembly',
    'indexedDB',
    'caches',
    'localStorage',
    'sessionStorage',
    'open',
  ]) {
    lockGlobal(name, undefined);
  }
  lockGlobal('setTimeout', setBoundedTimeout);
  lockGlobal('setInterval', setBoundedInterval);
  lockGlobal('clearTimeout', clearTrackedTimer);
  lockGlobal('clearInterval', clearTrackedTimer);
  try {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: false,
      writable: false,
      value: undefined,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: false,
      value: undefined,
    });
  } catch {
    // Browser実装が固定したCapabilityはAnalyzer側のdenylistでも到達を拒否する。
  }

  addWindowListener('message', (event: MessageEvent) => {
    if (event.source !== parentWindow || typeof event.data !== 'object' || event.data === null) {
      return;
    }
    const message = event.data as Readonly<Record<string, unknown>>;
    const keys = Object.keys(message).sort();
    const expected = [
      'exerciseSessionId',
      'executionRevision',
      'oneTimeToken',
      'payload',
      'requestId',
      'type',
      'version',
    ].sort();
    if (
      keys.length !== expected.length ||
      !keys.every((key, index) => key === expected[index]) ||
      message.version !== version ||
      message.type !== 'javascript.clear-timers' ||
      message.exerciseSessionId !== config.exerciseSessionId ||
      message.executionRevision !== config.executionRevision ||
      typeof message.requestId !== 'string' ||
      message.requestId.length === 0 ||
      message.requestId.length > 256 ||
      typeof message.oneTimeToken !== 'string' ||
      message.oneTimeToken.length === 0 ||
      message.oneTimeToken.length > 512 ||
      message.payload !== null ||
      usedRequestIds.has(message.requestId) ||
      usedTokens.has(message.oneTimeToken)
    ) {
      return;
    }
    usedRequestIds.add(message.requestId);
    usedTokens.add(message.oneTimeToken);
    if (usedRequestIds.size > maximumUsedRequests) return;
    clearAllTimers();
    send('javascript.timers-cleared', message.requestId, message.oneTimeToken, null);
  });

  return Object.freeze({
    checkLoop(): boolean {
      return hasBudget();
    },
    enterFunction(): boolean {
      functionDepth += 1;
      if (functionDepth > 1_024) {
        budgetExhausted = true;
        return false;
      }
      return hasBudget();
    },
    leaveFunction(): void {
      functionDepth = Math.max(0, functionDepth - 1);
    },
    run(callback: () => void): void {
      resetCallbackBudget();
      try {
        callback();
      } catch (error: unknown) {
        runtimeError = errorRecord(error);
      }
      send('javascript.execution-complete', 'execution', config.bootstrapToken, {
        executed: runtimeError === null,
        budgetExhausted,
        timerLimitExceeded,
        runtimeError,
      });
    },
  });
}

/** strict configとAnalyzer生成codeだけから自己完結classic script sourceを作る。 */
export function createJavaScriptExecutionSource(
  input: CreateJavaScriptExecutionSourceInput,
): string {
  assertBridgeConfig({
    exerciseSessionId: input.exerciseSessionId,
    executionRevision: input.executionRevision,
    bootstrapToken: input.bootstrapToken,
    viewport: { id: 'runtime', width: 1, height: 1 },
  });
  if (!SAFE_GUARD_IDENTIFIER.test(input.guardIdentifier)) {
    throw new Error('Invalid JavaScript guard identifier');
  }
  if (new TextEncoder().encode(input.instrumentedCode).byteLength > MAX_INSTRUMENTED_CODE_BYTES) {
    throw new Error('Instrumented JavaScript exceeds runtime limit');
  }
  const config = JSON.stringify({
    exerciseSessionId: input.exerciseSessionId,
    executionRevision: input.executionRevision,
    bootstrapToken: input.bootstrapToken,
  });
  return [
    '(function(){"use strict";',
    `const ${input.guardIdentifier}=(${createRuntimeState.toString()})(${config});`,
    `${input.guardIdentifier}.run(function(){"use strict";`,
    input.instrumentedCode,
    '\n});})();',
  ].join('');
}
