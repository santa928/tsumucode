import type {
  ExecutionEnvironment,
  ExecutionRequest,
  ExecutionResult,
  ExecutionService,
  ExecutionStatus,
  RunnerAdapter,
  RunnerDiagnostic,
} from './contracts';

/** 拒否理由と資源制限を採点から独立した実行状態へ分類する。 */
export function executionStatus(diagnostics: readonly RunnerDiagnostic[]): ExecutionStatus {
  const errors = diagnostics.filter(({ severity }) => severity === 'error');
  if (errors.some(({ code }) => ['javascript-budget', 'javascript-timer-limit'].includes(code)))
    return 'stopped';
  if (errors.some(({ kind }) => kind === 'system')) return 'system-error';
  if (errors.some(({ kind }) => kind === 'unsupported')) return 'unsupported';
  return errors.length === 0 ? 'succeeded' : 'code-error';
}

/** 既存の隔離・復旧処理を維持し、実行と任意DOM portへ接続する薄いwrapper。 */
export class BrowserExecutionService implements ExecutionService {
  readonly languageId;
  readonly environment: ExecutionEnvironment;
  readonly dom;
  #generation = 0;
  #frame: HTMLIFrameElement | undefined;
  #needsPrepare = false;
  #cleanup: Promise<void> = Promise.resolve();
  #disposed = false;
  #cancel: (() => void) | undefined;

  constructor(private readonly runner: RunnerAdapter) {
    this.languageId = runner.languageId;
    this.environment = Object.freeze({
      backend: 'browser',
      engine: runner.languageId === 'html-css' ? 'browser-html-css' : 'browser-js',
      mode: 'dom',
      capabilities:
        runner.languageId === 'html-css' ? (['dom'] as const) : (['console', 'dom'] as const),
    } as const);
    this.dom = {
      prepare: async (frame: HTMLIFrameElement): Promise<void> => {
        const generation = this.#generation;
        await this.#cleanup;
        if (this.#disposed || generation !== this.#generation)
          throw new Error('Execution disposed');
        await runner.prepare(frame);
        if (generation !== this.#generation) {
          await runner.dispose();
          throw new Error('Execution disposed');
        }
        this.#frame = frame;
        this.#needsPrepare = false;
      },
      requestSnapshot: runner.requestSnapshot.bind(runner),
      ...(runner.interact === undefined ? {} : { interact: runner.interact.bind(runner) }),
    };
  }

  /** 同じrevisionの再実行もrun IDで区別し、停止後の遅延応答を返さない。 */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    this.#cancel?.();
    const generation = ++this.#generation;
    const identity = {
      runId: request.runId,
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      backend: this.environment.backend,
      engine: this.environment.engine,
    };
    const failure = (status: ExecutionStatus, diagnostic: RunnerDiagnostic): ExecutionResult => ({
      ...identity,
      status,
      diagnostics: [diagnostic],
      evidence: [],
      console: [],
    });
    const stopped = (): ExecutionResult =>
      failure('stopped', {
        code: 'execution-stopped',
        kind: 'system',
        severity: 'error',
        message: 'Execution invalidated',
        learnerMessage: '実行を中止しました。採点は行っていません。',
      });
    if (this.#disposed) return stopped();
    const cancelled = new Promise<ExecutionResult>((resolve) => {
      this.#cancel = () => {
        resolve(stopped());
      };
    });
    const operation = (async (): Promise<ExecutionResult> => {
      try {
        await this.#cleanup;
        if (generation !== this.#generation) return stopped();
        if (
          request.requiredCapabilities.some(
            (capability) => !this.environment.capabilities.includes(capability),
          )
        ) {
          return failure('unsupported', {
            code: 'execution-capability',
            kind: 'unsupported',
            severity: 'error',
            message: 'Required capability is unavailable',
            learnerMessage: 'この環境では未対応です。必要な実行機能がないため採点していません。',
          });
        }
        if (
          request.backend !== identity.backend ||
          request.engine !== identity.engine ||
          request.languageId !== this.languageId ||
          request.presentation === undefined
        ) {
          throw new Error('Execution environment or presentation mismatch');
        }
        if (this.#needsPrepare && this.#frame !== undefined) {
          await this.runner.prepare(this.#frame);
          this.#needsPrepare = false;
        }
        if (generation !== this.#generation) return stopped();
        const result = await this.runner.render({
          exerciseSessionId: request.exerciseSessionId,
          executionRevision: request.executionRevision,
          languageId: request.languageId,
          files: request.files,
          options: request.options,
          ...request.presentation,
        });
        if (generation !== this.#generation) return stopped();
        if (
          result.exerciseSessionId !== identity.exerciseSessionId ||
          result.executionRevision !== identity.executionRevision
        ) {
          throw new Error('Runner render identityが要求と一致しません');
        }
        return { ...result, ...identity, status: executionStatus(result.diagnostics) };
      } catch (error: unknown) {
        if (generation !== this.#generation) return stopped();
        return failure('system-error', {
          code: 'execution-system',
          kind: 'system',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          learnerMessage:
            '実行環境で問題が起きました。編集内容を残しています。もう一度実行してください。',
        });
      }
    })();
    const result = await Promise.race([operation, cancelled]);
    if (generation === this.#generation) this.#cancel = undefined;
    return result;
  }

  /** 実行を即座に失効させ、隔離Runnerの資源を解放してから再準備を許可する。 */
  async stop(): Promise<void> {
    ++this.#generation;
    this.#cancel?.();
    this.#cancel = undefined;
    this.#needsPrepare = true;
    this.#cleanup = this.#cleanup.then(() => this.runner.dispose());
    return this.#cleanup;
  }

  /** 画面離脱・環境交換時に以降の実行を拒否して破棄する。 */
  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.stop();
    this.#frame = undefined;
  }
}
