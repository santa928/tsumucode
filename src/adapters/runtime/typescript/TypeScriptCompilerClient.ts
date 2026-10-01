import type { TypeScriptCompileResult } from './compileTypeScript';
import type { ScoreNumberAnnotationResult } from './checkScoreNumberAnnotation';
import type { ScoreNumberInferenceResult } from './checkScoreNumberInference';
import {
  isTypeScriptCompileInput,
  isTypeScriptCompileResult,
  isScoreNumberAnnotationResult,
  isScoreNumberInferenceResult,
  type CompilerWorkerRequest,
  type TypeScriptCompileInput,
} from './workerContract';

export interface CompilerWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: CompilerWorkerRequest): void;
  terminate(): void;
}

interface CompilerClientOptions {
  readonly workerFactory?: () => CompilerWorkerPort;
  readonly deadlineMs?: number;
}

interface PendingCompile {
  readonly worker: CompilerWorkerPort;
  readonly input: TypeScriptCompileInput;
  readonly requestId: string;
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

/** compiler基盤の障害を学習者の型エラーや採点結果と分離する。 */
function environmentFailure(): TypeScriptCompileResult {
  return {
    status: 'environment-error',
    diagnostics: [
      { code: 0, message: '型検査を完了できませんでした。コードを保持して再試行してください。' },
    ],
  };
}

/** 1回ずつ独立したWorkerで型検査し、停止・置換・期限切れで計算自体を破棄する。 */
export class TypeScriptCompilerClient {
  readonly #workerFactory: () => CompilerWorkerPort;
  readonly #deadlineMs: number;
  #pending: PendingCompile | undefined;
  #sequence = 0;
  #disposed = false;

  constructor(options: CompilerClientOptions = {}) {
    this.#workerFactory =
      options.workerFactory ??
      (() => new Worker(new URL('./compilerWorker.ts', import.meta.url), { type: 'module' }));
    // 初回compiler/lib読込も含めて止める上限。性能達成値ではない。
    this.#deadlineMs = options.deadlineMs ?? 10_000;
    if (!Number.isFinite(this.#deadlineMs) || this.#deadlineMs <= 0)
      throw new Error('Compiler deadline must be positive');
  }

  /** 新要求で旧計算を中止。入力を複写して呼出し後の編集と応答照合を分離する。 */
  compile(input: TypeScriptCompileInput): Promise<TypeScriptCompileResult> {
    return this.#request(input, 'compile', isTypeScriptCompileResult, environmentFailure, () => ({
      status: 'invalid-input',
      diagnostics: [{ code: 0, message: '型検査するファイルと編集状態を確認してください。' }],
    }));
  }

  /** 原文を同世代の専用操作で調べる。probe診断やASTは受け取らない。 */
  learningCheck(input: TypeScriptCompileInput): Promise<ScoreNumberAnnotationResult> {
    return this.#request(
      input,
      'score-number-annotation-v1',
      isScoreNumberAnnotationResult,
      () => ({
        status: 'system-error',
      }),
    );
  }

  /** 型推論Lesson専用profileと専用guardを選び、元TSの注釈なし推論を検証する。 */
  inferenceCheck(input: TypeScriptCompileInput): Promise<ScoreNumberInferenceResult> {
    return this.#request(input, 'score-number-inference-v1', isScoreNumberInferenceResult, () => ({
      status: 'system-error',
    }));
  }

  /** 共通の期限・停止機構を維持し、操作ごとの厳密な結果guardだけを切り替える。 */
  #request<T>(
    input: TypeScriptCompileInput,
    operation: 'compile' | 'score-number-annotation-v1' | 'score-number-inference-v1',
    isResult: (value: unknown, snapshot: TypeScriptCompileInput) => value is T,
    failure: () => T,
    invalidInput: () => T = failure,
  ): Promise<T> {
    const kind = operation === 'compile' ? 'compile' : 'learning-check';
    if (this.#disposed) return Promise.reject(new DOMException('Compiler disposed', 'AbortError'));
    this.cancel();
    if (!isTypeScriptCompileInput(input)) return Promise.resolve(invalidInput());
    const snapshot = { ...input, files: { ...input.files } };
    let worker: CompilerWorkerPort;
    try {
      worker = this.#workerFactory();
    } catch {
      return Promise.resolve(failure());
    }
    const requestId = String(++this.#sequence);
    return new Promise((resolve, reject) => {
      const pending: PendingCompile = {
        worker,
        input: snapshot,
        requestId,
        resolve: (result) => {
          resolve(isResult(result, snapshot) ? result : failure());
        },
        reject,
        timeout: setTimeout(() => {
          this.#finish(pending, undefined);
        }, this.#deadlineMs),
      };
      this.#pending = pending;
      worker.onmessage = (event) => {
        const value = event.data as Record<string, unknown> | null;
        if (this.#pending !== pending || !value || typeof value !== 'object') return;
        if (
          value['requestId'] !== requestId ||
          value['sessionId'] !== snapshot.sessionId ||
          value['revision'] !== snapshot.revision
        )
          return;
        const exactEnvelope =
          Object.keys(value).sort().join(',') === 'kind,requestId,result,revision,sessionId';
        this.#finish(
          pending,
          exactEnvelope && value['kind'] === kind ? value['result'] : undefined,
        );
      };
      worker.onerror = (event) => {
        event.preventDefault();
        this.#finish(pending, undefined);
      };
      worker.onmessageerror = () => {
        this.#finish(pending, undefined);
      };
      try {
        worker.postMessage(
          operation === 'compile'
            ? { kind: 'compile', requestId, input: snapshot }
            : { kind: 'learning-check', profile: operation, requestId, input: snapshot },
        );
      } catch {
        this.#finish(pending, undefined);
      }
    });
  }

  /** 学習者の中止や次の編集で、保留要求をAbortErrorにしてCPU計算を止める。 */
  cancel(): void {
    const pending = this.#pending;
    if (!pending) return;
    this.#release(pending);
    pending.reject(new DOMException('Compiler cancelled', 'AbortError'));
  }

  /** 画面離脱後は新規要求を拒否し、Workerを冪等に破棄する。 */
  dispose(): void {
    this.#disposed = true;
    this.cancel();
  }

  /** 古いWorkerからのイベントで現在の計算を終了させない。 */
  #finish(pending: PendingCompile, result: unknown): void {
    if (this.#pending !== pending) return;
    this.#release(pending);
    pending.resolve(result);
  }

  /** 正常完了でもWorkerを解放し、前回のcompiler状態を次要求へ持ち越さない。 */
  #release(pending: PendingCompile): void {
    clearTimeout(pending.timeout);
    pending.worker.onmessage = null;
    pending.worker.onerror = null;
    pending.worker.onmessageerror = null;
    pending.worker.terminate();
    this.#pending = undefined;
  }
}
