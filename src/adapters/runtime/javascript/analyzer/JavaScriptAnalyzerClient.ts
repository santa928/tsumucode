import type { RunnerDiagnostic } from '../../../../core/runtime/contracts';
import {
  isAnalyzerWorkerResponse,
  type AnalyzerWorkerPort,
  type AnalyzerWorkerRequest,
  type JavaScriptAnalysisFailure,
  type JavaScriptAnalysisInput,
  type JavaScriptAnalysisRequest,
  type JavaScriptAnalysisResult,
} from './contracts';

interface JavaScriptAnalyzerClientOptions {
  readonly workerFactory?: () => AnalyzerWorkerPort;
  readonly requestIdFactory?: () => string;
  readonly deadlineMs?: number;
}

interface PendingAnalysis {
  readonly request: JavaScriptAnalysisRequest;
  readonly resolve: (result: JavaScriptAnalysisResult) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_DEADLINE_MS = 500;

/** Viteが別chunkへ変換できるmodule Workerを遅延生成する。 */
function createAnalyzerWorker(): AnalyzerWorkerPort {
  return new Worker(new URL('./analyzerWorker.ts', import.meta.url), { type: 'module' });
}

/** Analyzer基盤障害を学習コードの不正解と混ぜない診断へ変換する。 */
function systemFailure(
  request: JavaScriptAnalysisRequest,
  message: string,
): JavaScriptAnalysisFailure {
  const diagnostic: RunnerDiagnostic = {
    code: 'javascript-analyzer-system',
    kind: 'system',
    severity: 'error',
    message,
    learnerMessage:
      'JavaScriptの解析を完了できませんでした。少し待ってからもう一度試してください。',
    file: request.file,
  };
  return {
    status: 'failure',
    requestId: request.requestId,
    exerciseSessionId: request.exerciseSessionId,
    executionRevision: request.executionRevision,
    file: request.file,
    diagnostics: [diagnostic],
  };
}

/** dispose起点の中断を共通Error型にする。 */
function analyzerAbortError(): Error {
  return new DOMException('JavaScript analyzer disposed', 'AbortError');
}

/** Worker lifecycle、deadline、response identityを親Document側で管理する。 */
export class JavaScriptAnalyzerClient {
  readonly #workerFactory: () => AnalyzerWorkerPort;
  readonly #requestIdFactory: () => string;
  readonly #deadlineMs: number;
  readonly #pending = new Map<string, PendingAnalysis>();
  readonly #usedRequestIds = new Set<string>();
  #worker: AnalyzerWorkerPort | undefined;
  #disposed = false;

  constructor(options: JavaScriptAnalyzerClientOptions = {}) {
    this.#workerFactory = options.workerFactory ?? createAnalyzerWorker;
    this.#requestIdFactory = options.requestIdFactory ?? (() => crypto.randomUUID());
    this.#deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    if (!Number.isFinite(this.#deadlineMs) || this.#deadlineMs <= 0) {
      throw new Error('Analyzer deadline must be positive');
    }
  }

  /** requestをWorkerへ送り、同じidentityの最初のresponseかdeadline結果を返す。 */
  analyze(input: JavaScriptAnalysisInput): Promise<JavaScriptAnalysisResult> {
    if (this.#disposed) return Promise.reject(analyzerAbortError());
    const requestId = this.#requestIdFactory();
    if (requestId.length === 0 || requestId.length > 128 || this.#usedRequestIds.has(requestId)) {
      return Promise.reject(new Error('Analyzer request ID is invalid or duplicated'));
    }
    this.#usedRequestIds.add(requestId);
    const request: JavaScriptAnalysisRequest = { ...input, requestId };
    let worker: AnalyzerWorkerPort;
    try {
      worker = this.#ensureWorker();
    } catch (error: unknown) {
      return Promise.resolve(
        systemFailure(
          request,
          `Analyzer Worker creation failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
    return new Promise<JavaScriptAnalysisResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#handleDeadline(requestId);
      }, this.#deadlineMs);
      this.#pending.set(requestId, { request, resolve, reject, timeout });
      const message: AnalyzerWorkerRequest = { type: 'analyze', request };
      try {
        worker.postMessage(message);
      } catch (error: unknown) {
        this.#failAll(
          `Analyzer postMessage failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  /** pendingを中断しWorkerを冪等に破棄する。 */
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#worker?.terminate();
    this.#worker = undefined;
    const error = analyzerAbortError();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  /** Workerを初回またはdeadline後に生成しlistenerを結ぶ。 */
  #ensureWorker(): AnalyzerWorkerPort {
    if (this.#worker !== undefined) return this.#worker;
    const worker = this.#workerFactory();
    worker.onmessage = (event) => {
      this.#handleMessage(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.#failAll(`Analyzer Worker error: ${event.message}`);
    };
    this.#worker = worker;
    return worker;
  }

  /** strict responseとpending identityが一致する場合だけresolveする。 */
  #handleMessage(value: unknown): void {
    if (this.#disposed || !isAnalyzerWorkerResponse(value)) return;
    const result = value.result;
    const pending = this.#pending.get(result.requestId);
    if (pending === undefined) return;
    const request = pending.request;
    if (
      result.exerciseSessionId !== request.exerciseSessionId ||
      result.executionRevision !== request.executionRevision ||
      result.file !== request.file
    ) {
      return;
    }
    clearTimeout(pending.timeout);
    this.#pending.delete(result.requestId);
    pending.resolve(result);
  }

  /** 期限切れrequestを含むWorker全体を止め、全pendingへ再試行可能な失敗を返す。 */
  #handleDeadline(requestId: string): void {
    if (!this.#pending.has(requestId)) return;
    this.#failAll('Analyzer deadline exceeded');
  }

  /** Worker障害時に同じWorker上の全pendingをsystem failureへ解決する。 */
  #failAll(message: string): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve(systemFailure(pending.request, message));
    }
    this.#pending.clear();
  }
}
