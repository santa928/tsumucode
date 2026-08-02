/** opaque-origin JavaScript iframeとの実行完了・timer停止通信契約。 */

export const JAVASCRIPT_PROTOCOL_VERSION = 1 as const;

const MAX_ID_LENGTH = 256;
const MAX_TOKEN_LENGTH = 512;
const MAX_ERROR_NAME_LENGTH = 128;
const MAX_ERROR_MESSAGE_LENGTH = 2_000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 1_500;

export interface JavaScriptRuntimeError {
  readonly name: string;
  readonly message: string;
}

export interface JavaScriptExecutionPayload {
  readonly executed: boolean;
  readonly budgetExhausted: boolean;
  readonly timerLimitExceeded: boolean;
  readonly runtimeError: JavaScriptRuntimeError | null;
}

interface JavaScriptExecutionEnvelope {
  readonly version: typeof JAVASCRIPT_PROTOCOL_VERSION;
  readonly type: 'javascript.execution-complete';
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly requestId: 'execution';
  readonly oneTimeToken: string;
  readonly payload: JavaScriptExecutionPayload;
}

interface JavaScriptTimersClearedEnvelope {
  readonly version: typeof JAVASCRIPT_PROTOCOL_VERSION;
  readonly type: 'javascript.timers-cleared';
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly requestId: string;
  readonly oneTimeToken: string;
  readonly payload: null;
}

export type JavaScriptRuntimeEnvelope =
  JavaScriptExecutionEnvelope | JavaScriptTimersClearedEnvelope;

export interface JavaScriptExecutionClientOptions {
  readonly responseTimeoutMs?: number;
  readonly tokenFactory?: () => string;
}

interface PendingTimerClear {
  readonly token: string;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

/** unknown値を配列でないRecordへ絞り込む。 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Objectが期待したfieldだけを持つか確認する。 */
function hasExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** Protocol識別子の長さを確認する。 */
function isIdentifier(value: unknown, maximum = MAX_ID_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

/** Runtime error payloadをboundedかつstrictに確認する。 */
function isRuntimeError(value: unknown): value is JavaScriptRuntimeError {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['message', 'name']) &&
    isIdentifier(value.name, MAX_ERROR_NAME_LENGTH) &&
    typeof value.message === 'string' &&
    value.message.length <= MAX_ERROR_MESSAGE_LENGTH
  );
}

/** iframe応答がstrictなJavaScript protocol envelopeか検証する。 */
export function isJavaScriptRuntimeEnvelope(value: unknown): value is JavaScriptRuntimeEnvelope {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'exerciseSessionId',
      'executionRevision',
      'oneTimeToken',
      'payload',
      'requestId',
      'type',
      'version',
    ]) ||
    value.version !== JAVASCRIPT_PROTOCOL_VERSION ||
    !isIdentifier(value.exerciseSessionId) ||
    !Number.isSafeInteger(value.executionRevision) ||
    Number(value.executionRevision) < 0 ||
    !isIdentifier(value.requestId) ||
    !isIdentifier(value.oneTimeToken, MAX_TOKEN_LENGTH)
  ) {
    return false;
  }
  if (value.type === 'javascript.timers-cleared') return value.payload === null;
  if (value.type !== 'javascript.execution-complete' || value.requestId !== 'execution')
    return false;
  const payload = value.payload;
  return (
    isRecord(payload) &&
    hasExactKeys(payload, ['budgetExhausted', 'executed', 'runtimeError', 'timerLimitExceeded']) &&
    typeof payload.executed === 'boolean' &&
    typeof payload.budgetExhausted === 'boolean' &&
    typeof payload.timerLimitExceeded === 'boolean' &&
    (payload.runtimeError === null || isRuntimeError(payload.runtimeError))
  );
}

/** timeout optionを有限な正数へ限定する。 */
function responseTimeout(options: JavaScriptExecutionClientOptions | undefined): number {
  const timeout = options?.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('JavaScript response timeout must be positive');
  }
  return timeout;
}

/** 実行完了とtimer停止をevent.source・identity・使い捨てtokenで認証する親Client。 */
export class JavaScriptExecutionClient {
  readonly #sourceWindow: Window;
  readonly #timeoutMs: number;
  readonly #tokenFactory: () => string;
  readonly #execution: Promise<JavaScriptExecutionPayload>;
  readonly #pendingTimerClears = new Map<string, PendingTimerClear>();
  readonly #usedRequestIds = new Set<string>();
  readonly #usedTokens = new Set<string>();
  #executionResolve: ((payload: JavaScriptExecutionPayload) => void) | undefined;
  #executionReject: ((error: Error) => void) | undefined;
  #executionTimeout: ReturnType<typeof setTimeout> | undefined;
  #executionState: 'pending' | 'resolved' | 'rejected' = 'pending';
  #disposed = false;

  readonly #listener = (event: MessageEvent): void => {
    if (this.#disposed || event.source !== this.#sourceWindow) return;
    if (!isJavaScriptRuntimeEnvelope(event.data)) return;
    const message = event.data;
    if (
      message.exerciseSessionId !== this.exerciseSessionId ||
      message.executionRevision !== this.executionRevision
    ) {
      return;
    }
    if (message.type === 'javascript.execution-complete') {
      if (this.#executionState !== 'pending' || message.oneTimeToken !== this.bootstrapToken) {
        return;
      }
      this.#executionState = 'resolved';
      if (this.#executionTimeout !== undefined) clearTimeout(this.#executionTimeout);
      this.#executionTimeout = undefined;
      this.#executionResolve?.(message.payload);
      this.#executionResolve = undefined;
      this.#executionReject = undefined;
      return;
    }
    const pending = this.#pendingTimerClears.get(message.requestId);
    if (pending === undefined || pending.token !== message.oneTimeToken) return;
    clearTimeout(pending.timeout);
    this.#pendingTimerClears.delete(message.requestId);
    pending.resolve();
  };

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly exerciseSessionId: string,
    private readonly executionRevision: number,
    private readonly bootstrapToken: string,
    options?: JavaScriptExecutionClientOptions,
  ) {
    if (
      !isIdentifier(exerciseSessionId) ||
      !Number.isSafeInteger(executionRevision) ||
      executionRevision < 0
    ) {
      throw new Error('Invalid JavaScript execution identity');
    }
    if (!isIdentifier(bootstrapToken, MAX_TOKEN_LENGTH)) {
      throw new Error('Invalid JavaScript execution token');
    }
    const sourceWindow = frame.contentWindow;
    if (sourceWindow === null) throw new Error('JavaScript frame has no contentWindow');
    this.#sourceWindow = sourceWindow;
    this.#timeoutMs = responseTimeout(options);
    this.#tokenFactory = options?.tokenFactory ?? (() => crypto.randomUUID());
    this.#execution = new Promise<JavaScriptExecutionPayload>((resolve, reject) => {
      this.#executionResolve = resolve;
      this.#executionReject = reject;
    });
    void this.#execution.catch(() => undefined);
    this.#executionTimeout = setTimeout(() => {
      if (this.#executionState !== 'pending') return;
      this.#executionState = 'rejected';
      this.#executionReject?.(new Error('JavaScript execution ready timeout'));
      this.#executionResolve = undefined;
      this.#executionReject = undefined;
    }, this.#timeoutMs);
    window.addEventListener('message', this.#listener);
  }

  /** 認証済みの同期実行完了を待つ。 */
  waitUntilExecuted(): Promise<JavaScriptExecutionPayload> {
    return this.#execution;
  }

  /** Snapshot前に未完了timerを全停止し、認証済みackを待つ。 */
  clearTimers(requestId: string): Promise<void> {
    if (this.#disposed) return Promise.reject(new Error('JavaScript execution disposed'));
    if (this.#executionState !== 'resolved') {
      return Promise.reject(new Error('JavaScript execution is not ready'));
    }
    if (
      !isIdentifier(requestId) ||
      this.#usedRequestIds.size >= 1_024 ||
      this.#usedRequestIds.has(requestId)
    ) {
      return Promise.reject(new Error('Timer clear request ID is invalid or duplicated'));
    }
    this.#usedRequestIds.add(requestId);
    const token = this.#tokenFactory();
    if (!isIdentifier(token, MAX_TOKEN_LENGTH) || this.#usedTokens.has(token)) {
      return Promise.reject(new Error('Timer clear token is invalid'));
    }
    this.#usedTokens.add(token);
    let pending!: PendingTimerClear;
    const promise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.#pendingTimerClears.get(requestId) !== pending) return;
        this.#pendingTimerClears.delete(requestId);
        reject(new Error('Timer clear response timeout'));
      }, this.#timeoutMs);
      pending = { token, resolve, reject, timeout };
      this.#pendingTimerClears.set(requestId, pending);
    });
    try {
      this.#sourceWindow.postMessage(
        {
          version: JAVASCRIPT_PROTOCOL_VERSION,
          type: 'javascript.clear-timers',
          exerciseSessionId: this.exerciseSessionId,
          executionRevision: this.executionRevision,
          requestId,
          oneTimeToken: token,
          payload: null,
        },
        '*',
      );
    } catch (error: unknown) {
      clearTimeout(pending.timeout);
      this.#pendingTimerClears.delete(requestId);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return promise;
  }

  /** Listener・watchdog・pending requestを冪等に破棄する。 */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    window.removeEventListener('message', this.#listener);
    if (this.#executionTimeout !== undefined) clearTimeout(this.#executionTimeout);
    this.#executionTimeout = undefined;
    if (this.#executionState === 'pending') {
      this.#executionState = 'rejected';
      this.#executionReject?.(new Error('JavaScript execution disposed'));
    }
    this.#executionResolve = undefined;
    this.#executionReject = undefined;
    for (const pending of this.#pendingTimerClears.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('JavaScript execution disposed'));
    }
    this.#pendingTimerClears.clear();
  }
}
