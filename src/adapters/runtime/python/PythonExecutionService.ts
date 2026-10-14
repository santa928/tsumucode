import { z } from 'zod';
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionService,
  ExecutionStatus,
  ExecutionPreparationProgress,
} from '../../../core/runtime/contracts';
import { createPythonFrameSource } from './pythonFrameSource';
import { PYTHON_LIMITS, type PythonCore, type PythonCoreProgress } from './pythonProtocol';
import {
  validPythonInputLines,
  validPythonFiles,
  pythonSourceSnapshot,
  type PythonLessonProfile,
} from '../../../core/runtime/pythonLessonProfiles.mjs';

const payloadSchema = z.object({
  type: z.literal('python-result'),
  status: z.enum(['succeeded', 'code-error', 'unsupported', 'stopped', 'system-error']),
  stdout: z.string().max(PYTHON_LIMITS.outputBytes),
  stderr: z.string().max(PYTHON_LIMITS.outputBytes),
  rows: z
    .array(
      z.object({ level: z.enum(['log', 'error']), text: z.string().max(PYTHON_LIMITS.lineBytes) }),
    )
    .max(PYTHON_LIMITS.lines),
  version: z.string().max(256).optional(),
  error: z.string().max(4096).optional(),
  reason: z.enum(['syntax', 'runtime', 'output-limit', 'time-limit', 'manual-stop']).optional(),
  file: z.enum(['main.py', 'lesson_tools.py']).optional(),
  numericVariablePrinted: z.boolean().optional(),
  sameVariableAdditionPrinted: z.boolean().optional(),
  inputEchoed: z.boolean().optional(),
  ageBoundaryBranched: z.boolean().optional(),
  rangeIterated: z.boolean().optional(),
  listReferenceSummed: z.boolean().optional(),
  dictValuesSummed: z.boolean().optional(),
  functionReturnScoped: z.boolean().optional(),
  moduleImported: z.boolean().optional(),
  exceptionHandled: z.boolean().optional(),
  projectSummed: z.boolean().optional(),
  listComprehensionFiltered: z.boolean().optional(),
  iteratorConsumed: z.boolean().optional(),
  generatorLifecycle: z.boolean().optional(),
  contextManagedClosed: z.boolean().optional(),
  dataProjectTested: z.boolean().optional(),
  classInstanceCompared: z.boolean().optional(),
  methodsCompared: z.boolean().optional(),
  inheritanceDelegationCompared: z.boolean().optional(),
  propertyRangeValidated: z.boolean().optional(),
  dunderProtocolsUsed: z.boolean().optional(),
  decoratorFlowCompared: z.boolean().optional(),
  wrapsMetadataPreserved: z.boolean().optional(),
  configuredDecoratorCompared: z.boolean().optional(),
  decoratorProjectRecorded: z.boolean().optional(),
  expectedOutput: z.string().max(4096).nullable().optional(),
});

export type PythonCoreLoader = (
  signal: AbortSignal,
  reportProgress?: (progress: PythonCoreProgress) => void,
) => Promise<PythonCore>;

/** 作者の固定self-host coreだけで動くConsole実行器。公開Courseへの登録は別受け入れ。 */
export class PythonExecutionService implements ExecutionService {
  readonly languageId = 'python';
  readonly environment = {
    backend: 'browser',
    engine: 'browser-python',
    mode: 'console',
    capabilities: ['console'],
  } as const;
  #generation = 0;
  #disposed = false;
  #abort: AbortController | undefined;
  #active: { stop(): Promise<void> } | undefined;
  #core: PythonCore | undefined;

  /** loaderは信頼側の固定core供給責務。入力sourceからURLや許可を選ばせない。 */
  constructor(
    private readonly loadCore: PythonCoreLoader,
    private readonly profile: PythonLessonProfile = 'values-vars-print-v1',
    private readonly readInputLines: () => readonly string[] = () => [],
    private readonly reportProgress: (progress: ExecutionPreparationProgress) => void = () => {},
  ) {}

  /** hashとrun identityを親で確定し、準備中・実行中の停止を同じ世代で失効する。 */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const generation = ++this.#generation;
    this.#abort?.abort();
    await this.#active?.stop();
    const identity = {
      runId: request.runId,
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      backend: this.environment.backend,
      engine: this.environment.engine,
    };
    const failure = (status: ExecutionStatus, message: string): ExecutionResult => ({
      ...identity,
      status,
      console: [],
      evidence: [],
      diagnostics: [
        {
          code: `python-${status}`,
          kind: status === 'unsupported' ? 'unsupported' : 'system',
          severity: 'error',
          message,
          learnerMessage: message,
        },
      ],
    });
    const stopped = (): ExecutionResult =>
      failure('stopped', '実行を停止しました。採点していません。');
    const stale = (): boolean => this.#disposed || generation !== this.#generation;
    if (stale()) return stopped();
    const inputLines = [...this.readInputLines()];
    if (!validPythonInputLines(inputLines))
      return failure('unsupported', '入力は16行・1 KiB以内にしてください。採点していません。');
    if (
      request.backend !== 'browser' ||
      request.engine !== 'browser-python' ||
      request.languageId !== 'python'
    )
      return failure('system-error', 'Python実行環境が一致しません。');
    if (
      request.requiredCapabilities.some((capability) => capability !== 'console') ||
      !validPythonFiles(request.files, this.profile)
    )
      return failure(
        'unsupported',
        '教材の固定Sourceと合計100 KiBの範囲を確認してください。採点していません。',
      );
    const source = request.files['main.py'];
    const files = { ...request.files };
    const encoder = new TextEncoder();
    const sourceBytes = encoder.encode(pythonSourceSnapshot(files, this.profile));
    const abort = new AbortController();
    this.#abort = abort;
    const preparation = { expired: false, downloadExpired: false };
    const began = performance.now();
    const sourceDeadline = began + PYTHON_LIMITS.preparationMilliseconds;
    const downloadDeadline = began + PYTHON_LIMITS.downloadMilliseconds;
    let receivedBytes = 0;
    const report = (stage: ExecutionPreparationProgress['stage']): void => {
      if (!stale() && !abort.signal.aborted)
        this.reportProgress({ ...identity, stage, receivedBytes });
    };
    const sourceTimer = setTimeout(() => {
      preparation.expired = true;
      abort.abort();
    }, PYTHON_LIMITS.preparationMilliseconds);
    const downloading = this.#core === undefined;
    const downloadTimer = downloading
      ? setTimeout(() => {
          preparation.downloadExpired = true;
          abort.abort();
        }, PYTHON_LIMITS.downloadMilliseconds)
      : undefined;
    try {
      const cancelled = new Promise<never>((_resolve, reject) => {
        abort.signal.addEventListener(
          'abort',
          () => {
            reject(new Error('Python preparation cancelled'));
          },
          { once: true },
        );
      });
      const digestPromise = crypto.subtle.digest('SHA-256', sourceBytes).then((digest) => {
        if (abort.signal.aborted || performance.now() >= sourceDeadline) {
          preparation.expired = true;
          throw new Error('Python Source preparation expired');
        }
        clearTimeout(sourceTimer);
        return digest;
      });
      const corePromise =
        this.#core ??
        this.loadCore(abort.signal, (progress) => {
          if (performance.now() >= downloadDeadline) {
            preparation.downloadExpired = true;
            abort.abort();
            return;
          }
          receivedBytes = progress.receivedBytes;
          report(progress.stage);
        }).then((core) => {
          const expired = performance.now() >= downloadDeadline;
          if (abort.signal.aborted || expired) {
            preparation.downloadExpired ||= expired;
            throw new Error('Python core download expired');
          }
          clearTimeout(downloadTimer);
          return core;
        });
      const [core, digest] = await Promise.race([
        Promise.all([corePromise, digestPromise]),
        cancelled,
      ]);
      clearTimeout(sourceTimer);
      clearTimeout(downloadTimer);
      if (stale()) return stopped();
      if (abort.signal.aborted || (downloading && performance.now() >= downloadDeadline)) {
        preparation.downloadExpired = downloading && performance.now() >= downloadDeadline;
        throw new Error('Python preparation completed after its deadline');
      }
      // 同じ実行器では照合済み固定bytesだけを再利用し、Source・Workerは毎run作り直す。
      this.#core = core;
      report('initialize');
      // 同期observerからstop/disposeされた場合も、旧Source用のframeを作らない。
      if (stale()) return stopped();
      if (this.#abort === abort) this.#abort = undefined;
      const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      return await new Promise<ExecutionResult>((resolve) => {
        const frame = document.createElement('iframe');
        frame.hidden = true;
        frame.title = 'Python実行環境';
        frame.sandbox.add('allow-scripts');
        let done = false;
        let stopping = false;
        let ready = false;
        let stopResolve: (() => void) | undefined;
        let stopWait: Promise<void> | undefined;
        const finish = (value: ExecutionResult): void => {
          if (done) return;
          done = true;
          clearTimeout(deadline);
          window.removeEventListener('message', receive);
          frame.remove();
          if (this.#active === active) this.#active = undefined;
          stopResolve?.();
          resolve(stopping || stale() ? stopped() : value);
        };
        const receive = (event: MessageEvent<unknown>): void => {
          if (!event.isTrusted || event.source !== frame.contentWindow || event.origin !== 'null')
            return;
          if (
            !ready &&
            typeof event.data === 'object' &&
            event.data !== null &&
            'type' in event.data &&
            event.data.type === 'python-frame-ready'
          ) {
            ready = true;
            frame.contentWindow?.postMessage(
              stopping
                ? 'python-stop'
                : { ...core, source, files, profile: this.profile, inputLines },
              '*',
            );
            return;
          }
          if (
            ready &&
            typeof event.data === 'object' &&
            event.data !== null &&
            'type' in event.data &&
            event.data.type === 'python-worker-ready'
          ) {
            report('execute');
            return;
          }
          const parsed = payloadSchema.safeParse(event.data);
          if (!parsed.success) return;
          const payload = parsed.data;
          const byteCount =
            encoder.encode(payload.stdout).byteLength + encoder.encode(payload.stderr).byteLength;
          if (byteCount > PYTHON_LIMITS.outputBytes) return;
          const rows = payload.rows;
          if (
            rows.length > 2 * PYTHON_LIMITS.lines ||
            rows.some((row) => encoder.encode(row.text).byteLength > PYTHON_LIMITS.lineBytes)
          )
            return;
          const message = payload.error ?? 'Python実行が完了しませんでした。';
          // 内部loader/ASTの長いtracebackは詳細に残し、教材UIには最後のPython例外を示す。
          const learnerMessage =
            payload.reason === 'output-limit'
              ? '出力の上限に達したため停止しました。採点していません。'
              : payload.status === 'code-error'
                ? `${payload.reason === 'syntax' ? 'Pythonの構文を確認してください。' : 'Pythonの名前や値の使い方を確認してください。'} ${message.trim().split('\n').at(-1) ?? ''}`
                : message;
          finish({
            ...identity,
            status: payload.status,
            ...(payload.version === undefined ? {} : { engineVersion: payload.version }),
            console: rows.map((row, sequence) => ({ ...row, sequence })),
            diagnostics:
              payload.status === 'succeeded'
                ? []
                : [
                    {
                      code: `python-${payload.reason ?? payload.status}`,
                      kind:
                        payload.status === 'code-error'
                          ? payload.reason === 'syntax'
                            ? 'syntax'
                            : 'reference'
                          : payload.status === 'unsupported'
                            ? 'unsupported'
                            : 'system',
                      severity: 'error',
                      message,
                      learnerMessage,
                      file: payload.file ?? 'main.py',
                    },
                  ],
            evidence:
              payload.status === 'succeeded'
                ? [
                    { id: 'python.executed', value: true },
                    { id: 'python.source-sha256', file: 'main.py', value: hash },
                    { id: 'python.stdout', value: payload.stdout },
                    { id: 'python.version', value: payload.version ?? '' },
                    { id: 'python.input-lines', value: JSON.stringify(inputLines) },
                    { id: 'python.expected-output', value: payload.expectedOutput ?? '' },
                    { id: 'python.module-imported', value: payload.moduleImported === true },
                    { id: 'python.exception-handled', value: payload.exceptionHandled === true },
                    { id: 'python.project-summed', value: payload.projectSummed === true },
                    {
                      id: 'python.list-comprehension-filtered',
                      value: payload.listComprehensionFiltered === true,
                    },
                    { id: 'python.iterator-consumed', value: payload.iteratorConsumed === true },
                    {
                      id: 'python.generator-lifecycle',
                      value: payload.generatorLifecycle === true,
                    },
                    {
                      id: 'python.context-managed-closed',
                      value: payload.contextManagedClosed === true,
                    },
                    {
                      id: 'python.data-project-tested',
                      value: payload.dataProjectTested === true,
                    },
                    {
                      id: 'python.class-instance-compared',
                      value: payload.classInstanceCompared === true,
                    },
                    { id: 'python.methods-compared', value: payload.methodsCompared === true },
                    {
                      id: 'python.inheritance-delegation-compared',
                      value: payload.inheritanceDelegationCompared === true,
                    },
                    {
                      id: 'python.property-range-validated',
                      value: payload.propertyRangeValidated === true,
                    },
                    {
                      id: 'python.dunder-protocols-used',
                      value: payload.dunderProtocolsUsed === true,
                    },
                    {
                      id: 'python.decorator-flow-compared',
                      value: payload.decoratorFlowCompared === true,
                    },
                    {
                      id: 'python.wraps-metadata-preserved',
                      value: payload.wrapsMetadataPreserved === true,
                    },
                    {
                      id: 'python.configured-decorator-compared',
                      value: payload.configuredDecoratorCompared === true,
                    },
                    {
                      id: 'python.decorator-project-recorded',
                      value: payload.decoratorProjectRecorded === true,
                    },
                    { id: 'python.input-echoed', value: payload.inputEchoed === true },
                    {
                      id: 'python.age-boundary-branched',
                      value: payload.ageBoundaryBranched === true,
                    },
                    { id: 'python.range-iterated', value: payload.rangeIterated === true },
                    {
                      id: 'python.list-reference-summed',
                      value: payload.listReferenceSummed === true,
                    },
                    { id: 'python.dict-values-summed', value: payload.dictValuesSummed === true },
                    {
                      id: 'python.function-return-scoped',
                      value: payload.functionReturnScoped === true,
                    },
                    {
                      id: 'python.numeric-variable-printed',
                      value: payload.numericVariablePrinted === true,
                    },
                    {
                      id: 'python.same-variable-addition-printed',
                      value: payload.sameVariableAdditionPrinted === true,
                    },
                  ]
                : [],
          });
        };
        const active = {
          stop: (): Promise<void> => {
            if (done) return Promise.resolve();
            stopping = true;
            stopWait ??= new Promise<void>((resolveStop) => {
              stopResolve = resolveStop;
            });
            frame.contentWindow?.postMessage('python-stop', '*');
            return stopWait;
          },
        };
        const deadline = setTimeout(
          () => {
            finish(
              failure('system-error', 'Python実行環境から応答がありません。採点していません。'),
            );
          },
          PYTHON_LIMITS.initializationMilliseconds + PYTHON_LIMITS.executionMilliseconds + 1500,
        );
        this.#active = active;
        window.addEventListener('message', receive);
        frame.srcdoc = createPythonFrameSource(crypto.randomUUID().replaceAll('-', ''));
        document.body.append(frame);
      });
    } catch {
      return stale()
        ? stopped()
        : failure(
            'system-error',
            preparation.downloadExpired
              ? 'Python固定実行環境の取得が時間内に完了しませんでした。編集内容を保持しています。「プレビューを更新」で再試行してください。'
              : preparation.expired
                ? 'Python実行準備が時間内に完了しませんでした。採点していません。'
                : 'Python実行準備に失敗しました。Sourceを保持して再試行してください。',
          );
    } finally {
      // 自分の期限でabortした場合も、現在runの待機表示を終了する。
      if (!stale()) this.reportProgress({ ...identity, stage: 'finished', receivedBytes });
      abort.abort();
      clearTimeout(sourceTimer);
      clearTimeout(downloadTimer);
      if (this.#abort === abort) this.#abort = undefined;
    }
  }

  /** 準備中はabort、実行中はopaque frameのWorker termination完了を待つ。 */
  async stop(): Promise<void> {
    ++this.#generation;
    this.#abort?.abort();
    await this.#active?.stop();
  }

  /** dispose後は再実行しない。Reset/離脱時はstopを使う。 */
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#core = undefined;
    await this.stop();
  }
}
