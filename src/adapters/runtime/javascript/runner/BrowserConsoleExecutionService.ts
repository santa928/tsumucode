import { z } from 'zod';
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionService,
  ExecutionStatus,
} from '../../../../core/runtime/contracts';
import { checkConsoleSource } from '../analyzer/consoleSourcePolicy';
import { createConsoleFrameSource } from './consoleWorkerSource';

const runtimeSchema = z.object({
  kind: z.literal('javascript'),
  entryFile: z.literal('script.js'),
  sourceType: z.literal('script'),
  primaryOutput: z.literal('console'),
});
const payloadSchema = z.object({
  type: z.literal('console-result'),
  status: z.enum(['succeeded', 'code-error', 'stopped', 'system-error']),
  rows: z
    .array(
      z.object({ level: z.enum(['log', 'info', 'warn', 'error']), text: z.string().max(4096) }),
    )
    .max(100),
  error: z.string().max(4096).optional(),
});
interface ActiveRun {
  readonly stop: () => Promise<void>;
}

/** Console専用のopaque iframe/Worker。DOM観測を提供せず、停止後は新Workerで再利用する。 */
export class BrowserConsoleExecutionService implements ExecutionService {
  readonly languageId = 'javascript';
  readonly environment = {
    backend: 'browser',
    engine: 'browser-js',
    mode: 'console',
    capabilities: ['console'],
  } as const;
  #generation = 0;
  #disposed = false;
  #active: ActiveRun | undefined;
  #cancelPreparation: (() => void) | undefined;

  /** 対応判定とsource hashは信頼側で確定し、結果のidentityをWorkerに選ばせない。 */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const generation = ++this.#generation;
    this.#cancelPreparation?.();
    const identity = {
      runId: request.runId,
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      backend: this.environment.backend,
      engine: this.environment.engine,
    };
    const failure = (
      status: ExecutionStatus,
      message: string,
      codeErrorKind: 'syntax' | 'reference' = 'syntax',
    ): ExecutionResult => ({
      ...identity,
      status,
      console: [],
      evidence: [],
      diagnostics: [
        {
          code: `browser-console-${status}`,
          kind:
            status === 'unsupported'
              ? 'unsupported'
              : status === 'code-error'
                ? codeErrorKind
                : 'system',
          severity: 'error',
          message,
          learnerMessage: message,
        },
      ],
    });
    const stopped = (): ExecutionResult =>
      failure('stopped', '実行を停止しました。採点していません。');
    const stale = (): boolean => this.#disposed || generation !== this.#generation;
    await this.#active?.stop();
    if (stale()) return stopped();
    if (
      request.backend !== 'browser' ||
      request.engine !== 'browser-js' ||
      request.languageId !== 'javascript'
    )
      return failure('system-error', '実行環境が一致しないため採点していません。');
    if (
      request.requiredCapabilities.some((capability) => capability !== 'console') ||
      !runtimeSchema.safeParse(request.options.runtime).success
    )
      return failure(
        'unsupported',
        'この環境では単一scriptのConsole演習だけに対応しています。採点していません。',
      );
    const source = request.files['script.js'];
    if (typeof source !== 'string')
      return failure('system-error', '実行するscript.jsがありません。');
    const check = checkConsoleSource(source);
    if (check.status !== 'supported') {
      return failure(
        check.status === 'syntax'
          ? 'code-error'
          : check.status === 'system'
            ? 'system-error'
            : check.status,
        check.status === 'unsupported'
          ? `この環境では ${check.name} は未対応です（${String(check.line)}行目）。採点していません。`
          : check.status === 'syntax'
            ? `JavaScriptの書き方を確認してください（${String(check.line)}行目）。`
            : 'コードの解析限界を超えたため採点していません。',
      );
    }
    try {
      let preparationTimer: ReturnType<typeof setTimeout> | undefined;
      let cancelPreparation: (() => void) | undefined;
      const cancelled = new Promise<undefined>((resolve) => {
        cancelPreparation = () => {
          resolve(undefined);
        };
        this.#cancelPreparation = cancelPreparation;
        preparationTimer = setTimeout(cancelPreparation, 2500);
      });
      let digest: ArrayBuffer | undefined;
      try {
        digest = await Promise.race([
          crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)),
          cancelled,
        ]);
      } finally {
        clearTimeout(preparationTimer);
        if (this.#cancelPreparation === cancelPreparation) this.#cancelPreparation = undefined;
      }
      if (stale()) return stopped();
      if (digest === undefined)
        return failure('system-error', '実行準備が時間内に完了しませんでした。採点していません。');
      const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      if (stale()) return stopped();
      return await new Promise<ExecutionResult>((resolve) => {
        const frame = document.createElement('iframe');
        frame.hidden = true;
        frame.sandbox.add('allow-scripts');
        frame.title = 'Console実行環境';
        let done = false;
        let stopping = false;
        let stopResolve: (() => void) | undefined;
        let stopWait: Promise<void> | undefined;
        const finish = (result: ExecutionResult): void => {
          if (done) return;
          done = true;
          clearTimeout(deadline);
          window.removeEventListener('message', receive);
          frame.remove();
          if (this.#active === active) this.#active = undefined;
          stopResolve?.();
          resolve(stopping || stale() ? stopped() : result);
        };
        const receive = (event: MessageEvent<unknown>): void => {
          if (!event.isTrusted || event.source !== frame.contentWindow || event.origin !== 'null')
            return;
          const parsed = payloadSchema.safeParse(event.data);
          if (!parsed.success) return;
          const payload = parsed.data;
          const encoder = new TextEncoder();
          let total = 0;
          for (const row of payload.rows) {
            const bytes = encoder.encode(row.text).byteLength;
            if (bytes > 4096) return;
            total += bytes;
          }
          if (total > 65536) return;
          const failureReason =
            payload.status === 'stopped'
              ? payload.error === 'Console output limit'
                ? 'output-limit'
                : 'time-limit'
              : payload.status;
          const learnerMessage =
            payload.status === 'stopped'
              ? payload.error === 'Console output limit'
                ? 'Console出力が上限に達したため停止しました。採点していません。'
                : '実行時間の上限に達したため停止しました。採点していません。'
              : payload.status === 'system-error'
                ? '実行環境の準備に失敗しました。採点していません。'
                : (payload.error ?? '実行が完了しませんでした。');
          const result =
            payload.status === 'succeeded'
              ? {
                  ...identity,
                  status: 'succeeded' as const,
                  diagnostics: [],
                  console: payload.rows.map((row, sequence) => ({ ...row, sequence })),
                  evidence: [
                    { id: 'javascript.executed', value: true },
                    { id: 'javascript.budget-exhausted', value: false },
                    { id: 'javascript.source-sha256', file: 'script.js', value: hash },
                  ],
                }
              : {
                  ...failure(payload.status, learnerMessage, 'reference'),
                  console: payload.rows.map((row, sequence) => ({ ...row, sequence })),
                };
          finish({
            ...result,
            diagnostics: result.diagnostics.map((diagnostic) => ({
              ...diagnostic,
              code: `browser-console-${failureReason}`,
            })),
          });
        };
        const active: ActiveRun = {
          stop: () => {
            if (done) return Promise.resolve();
            stopping = true;
            stopWait ??= new Promise<void>((resolveStop) => {
              stopResolve = resolveStop;
            });
            frame.contentWindow?.postMessage('stop', '*');
            return stopWait;
          },
        };
        // srcdoc未準備中にstopされた場合も、listener設置後に再度停止を送る。
        frame.onload = () => {
          if (stopping) frame.contentWindow?.postMessage('stop', '*');
        };
        const deadline = setTimeout(() => {
          finish(failure('system-error', '実行環境から応答がありません。採点していません。'));
        }, 2500);
        this.#active = active;
        window.addEventListener('message', receive);
        const nonce = crypto.randomUUID().replaceAll('-', '');
        frame.srcdoc = createConsoleFrameSource(source, nonce);
        document.body.append(frame);
      });
    } catch {
      return stale()
        ? stopped()
        : failure('system-error', '実行環境の準備に失敗しました。採点していません。');
    }
  }

  /** 旧runを失効させ、iframeからWorker停止の応答を得てから資源を外す。 */
  async stop(): Promise<void> {
    ++this.#generation;
    this.#cancelPreparation?.();
    await this.#active?.stop();
  }

  /** 最終破棄後はexecuteを開始しない。Resetはstopを使う。 */
  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.stop();
  }
}
