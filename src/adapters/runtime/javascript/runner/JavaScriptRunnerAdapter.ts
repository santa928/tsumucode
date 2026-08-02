import type {
  PreviewSnapshot,
  PreviewViewport,
  RunnerAdapter,
  RunnerDiagnostic,
  RunnerInput,
  RunnerRenderResult,
  SnapshotRequest,
} from '../../../../core/runtime/contracts';
import { resolvePublicAsset } from '../../../../shared/lib/resolvePublicAsset';
import { diagnoseSyntax } from '../../html-css/diagnoseSyntax';
import { PreviewBridgeClient } from '../../html-css/previewProtocol';
import type { MaterializedPreviewAssets } from '../../preview-kernel/materializePreviewAssets';
import {
  prepareHtmlCssPreview,
  validateHtmlCssPreviewInput,
  type ValidatedHtmlCssPreviewInput,
} from '../../preview-kernel/prepareHtmlCssPreview';
import { JavaScriptAnalyzerClient } from '../analyzer/JavaScriptAnalyzerClient';
import type { JavaScriptAnalysisInput, JavaScriptAnalysisResult } from '../analyzer/contracts';
import { createJavaScriptExecutionSource } from './bridgeSource';
import { createJavaScriptSrcdoc } from './createJavaScriptSrcdoc';
import { JavaScriptExecutionClient, type JavaScriptExecutionPayload } from './protocol';

interface JavaScriptAnalyzerPort {
  analyze(input: JavaScriptAnalysisInput): Promise<JavaScriptAnalysisResult>;
  dispose(): Promise<void>;
}

export interface JavaScriptRunnerAdapterOptions {
  readonly analyzer?: JavaScriptAnalyzerPort;
  readonly executionTimeoutMs?: number;
  readonly uuidFactory?: () => string;
}

interface RuntimeResources {
  readonly materialized: MaterializedPreviewAssets;
}

interface StoredPreview {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly sourceSha256: string;
  readonly scriptFile: string;
  readonly resources: RuntimeResources;
  readonly srcdoc: string;
  readonly bootstrapToken: string;
  readonly viewport: PreviewViewport;
}

interface ActivePreview extends StoredPreview {
  readonly bridge: PreviewBridgeClient;
  readonly execution: JavaScriptExecutionClient;
}

interface InFlightRender {
  readonly generation: number;
  readonly controller: AbortController;
  bridge?: PreviewBridgeClient;
  execution?: JavaScriptExecutionClient;
  promise?: Promise<RunnerRenderResult>;
}

interface ValidatedJavaScriptInput {
  readonly html: ValidatedHtmlCssPreviewInput;
  readonly scriptFile: string;
  readonly scriptSource: string;
}

const MAX_WORKSPACE_BYTES = 300 * 1024;
const UTF8 = new TextEncoder();

/** staleまたはdisposeされたrenderを同じError型へ揃える。 */
function renderAbortError(): Error {
  return new DOMException('JavaScript preview render superseded', 'AbortError');
}

/** iframeのLayout寸法をsrcdoc navigation前に確定する。 */
function applyPreviewViewport(frame: HTMLIFrameElement, viewport: PreviewViewport): void {
  frame.style.width = `${String(viewport.width)}px`;
  frame.style.height = `${String(viewport.height)}px`;
  frame.getBoundingClientRect();
}

/** workspace pathをcanonical相対pathへ変換する。 */
function canonicalWorkspacePath(path: string): string {
  return resolvePublicAsset('/', path).slice(1);
}

/** JavaScript用のidentity、workspace容量、entry、scriptを遷移前に検証する。 */
function validateJavaScriptInput(input: RunnerInput): ValidatedJavaScriptInput {
  const html = validateHtmlCssPreviewInput(input, 'javascript');
  const totalBytes = Object.values(input.files).reduce(
    (total, source) => total + UTF8.encode(source).byteLength,
    0,
  );
  if (totalBytes > MAX_WORKSPACE_BYTES) {
    throw new Error('JavaScript workspace exceeds 300 KiB');
  }
  const configuredScript = input.options.scriptFile;
  if (configuredScript !== undefined && typeof configuredScript !== 'string') {
    throw new Error('JavaScript scriptFile must be a string');
  }
  let scriptFile: string;
  try {
    scriptFile = canonicalWorkspacePath(configuredScript ?? 'script.js');
  } catch {
    throw new Error('JavaScript scriptFile must be a safe relative path');
  }
  if (!/\.js$/iu.test(scriptFile)) throw new Error('JavaScript scriptFile must end with .js');
  const scriptSource = html.files.get(scriptFile);
  if (scriptSource === undefined) throw new Error(`JavaScript scriptFile not found: ${scriptFile}`);
  return { html, scriptFile, scriptSource };
}

/** 基盤障害を学習コードの不正解にしないsystem診断へ変換する。 */
function systemDiagnostic(error: unknown): RunnerDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: 'javascript-runner-system',
    kind: 'system',
    severity: 'error',
    message,
    learnerMessage:
      'JavaScriptのプレビューを準備できませんでした。コードは保存されています。少し待ってからもう一度試してください。',
  };
}

/** 実行payloadを利用者向け診断へ変換する。 */
function executionDiagnostics(
  payload: JavaScriptExecutionPayload,
  scriptFile: string,
): RunnerDiagnostic[] {
  const diagnostics: RunnerDiagnostic[] = [];
  if (payload.budgetExhausted) {
    diagnostics.push({
      code: 'javascript-budget',
      kind: 'system',
      severity: 'error',
      message: 'JavaScript execution budget exhausted',
      learnerMessage:
        '処理が長く続いたため安全に停止しました。繰り返しの条件や関数の呼び出しを確認してください。',
      file: scriptFile,
    });
  }
  if (payload.timerLimitExceeded) {
    diagnostics.push({
      code: 'javascript-timer-limit',
      kind: 'system',
      severity: 'error',
      message: 'JavaScript timer limit exceeded',
      learnerMessage: '同時に動かせるtimerは10件までです。不要なtimerを減らしてください。',
      file: scriptFile,
    });
  }
  if (payload.runtimeError !== null) {
    diagnostics.push({
      code: 'javascript-runtime',
      kind: 'reference',
      severity: 'error',
      message: `${payload.runtimeError.name}: ${payload.runtimeError.message}`,
      learnerMessage:
        'JavaScriptの実行中にエラーが起きました。名前の書き間違いや対象Elementを確認してください。',
      file: scriptFile,
    });
  }
  return diagnostics;
}

/** JavaScriptをAnalyzer→opaque iframe→認証済みSnapshotの順で扱うRunner。 */
export class JavaScriptRunnerAdapter implements RunnerAdapter {
  readonly languageId = 'javascript' as const;
  readonly #analyzer: JavaScriptAnalyzerPort;
  readonly #executionTimeoutMs: number;
  readonly #uuidFactory: () => string;
  #frame: HTMLIFrameElement | undefined;
  #active: ActivePreview | undefined;
  #restorable: StoredPreview | undefined;
  #inFlight: InFlightRender | undefined;
  #generation = 0;

  readonly #loadListener = (): void => {
    const frame = this.#frame;
    const active = this.#active;
    if (frame === undefined || active === undefined || this.#inFlight !== undefined) return;
    active.bridge.dispose();
    active.execution.dispose();
    this.#disposeResources(active.resources);
    this.#active = undefined;
    frame.srcdoc = '';
  };

  constructor(options: JavaScriptRunnerAdapterOptions = {}) {
    this.#analyzer = options.analyzer ?? new JavaScriptAnalyzerClient();
    this.#executionTimeoutMs = options.executionTimeoutMs ?? 1_500;
    this.#uuidFactory = options.uuidFactory ?? (() => crypto.randomUUID());
    if (!Number.isFinite(this.#executionTimeoutMs) || this.#executionTimeoutMs <= 0) {
      throw new Error('JavaScript execution timeout must be positive');
    }
  }

  /** 旧処理を解放し、opaque-origin用属性を固定する。 */
  async prepare(frame: HTMLIFrameElement): Promise<void> {
    const previousFrame = this.#frame;
    await this.#reset(false);
    if (previousFrame !== undefined && previousFrame !== frame) {
      previousFrame.removeEventListener('load', this.#loadListener);
      previousFrame.srcdoc = '';
    }
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', 'JavaScriptコードのプレビュー');
    frame.removeEventListener('load', this.#loadListener);
    frame.addEventListener('load', this.#loadListener);
    this.#frame = frame;
  }

  /** 最新revisionを解析し、認証済み実行完了後だけ結果を確定する。 */
  render(input: RunnerInput): Promise<RunnerRenderResult> {
    const frame = this.#frame;
    if (frame === undefined) return Promise.reject(new Error('Runner is not prepared'));
    let validated: ValidatedJavaScriptInput;
    try {
      validated = validateJavaScriptInput(input);
    } catch (error: unknown) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.#cancelInFlight();
    const operation: InFlightRender = {
      generation: ++this.#generation,
      controller: new AbortController(),
    };
    this.#inFlight = operation;
    const promise = this.#performRender(frame, input, validated, operation);
    operation.promise = promise;
    return promise;
  }

  /** timer停止後、activeな同一session／revisionだけをSnapshot Bridgeへ渡す。 */
  async requestSnapshot(request: SnapshotRequest): Promise<PreviewSnapshot> {
    const active = this.#active;
    if (
      active === undefined ||
      active.exerciseSessionId !== request.exerciseSessionId ||
      active.executionRevision !== request.executionRevision
    ) {
      throw new Error('JavaScript preview session or revision is not current');
    }
    await active.execution.clearTimers(this.#uuidFactory());
    return active.bridge.requestSnapshot(request.requestId, request.policy);
  }

  /** iframe、Worker、Bridge、教材Assetを冪等に解放する。 */
  async dispose(): Promise<void> {
    const frame = this.#frame;
    await this.#reset(true);
    await this.#analyzer.dispose();
    if (frame !== undefined) {
      frame.removeEventListener('load', this.#loadListener);
      frame.srcdoc = '';
    }
    this.#frame = undefined;
  }

  /** Analyzer・sanitizer・runtime・Bridgeを1 generationへ結ぶ。 */
  async #performRender(
    frame: HTMLIFrameElement,
    input: RunnerInput,
    validated: ValidatedJavaScriptInput,
    operation: InFlightRender,
  ): Promise<RunnerRenderResult> {
    let unownedMaterialized: MaterializedPreviewAssets | undefined;
    let resources: RuntimeResources | undefined;
    let bridge: PreviewBridgeClient | undefined;
    let execution: JavaScriptExecutionClient | undefined;
    let transitionStarted = false;
    try {
      const guardIdentifier = `__tsumuBudget_${this.#uuidFactory().replaceAll('-', '_')}`;
      const analysis = await this.#analyzer.analyze({
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        file: validated.scriptFile,
        source: validated.scriptSource,
        guardIdentifier,
      });
      this.#assertCurrent(frame, operation);
      if (analysis.status === 'failure') {
        if (this.#inFlight === operation) this.#inFlight = undefined;
        return {
          exerciseSessionId: input.exerciseSessionId,
          executionRevision: input.executionRevision,
          diagnostics: analysis.diagnostics,
          evidence: [],
        };
      }
      if (
        analysis.exerciseSessionId !== input.exerciseSessionId ||
        analysis.executionRevision !== input.executionRevision ||
        analysis.file !== validated.scriptFile
      ) {
        throw new Error('JavaScript analysis identity mismatch');
      }
      const preview = await prepareHtmlCssPreview(input, validated.html, {
        signal: operation.controller.signal,
        acknowledgedScriptFile: validated.scriptFile,
      });
      unownedMaterialized = preview.materialized;
      this.#assertCurrent(frame, operation);
      const scriptNonce = this.#uuidFactory().replaceAll('-', '');
      const bootstrapToken = this.#uuidFactory();
      const authenticatedRuntimeSource = createJavaScriptExecutionSource({
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        bootstrapToken,
        guardIdentifier,
        instrumentedCode: analysis.instrumentedCode,
      });
      resources = { materialized: preview.materialized };
      unownedMaterialized = undefined;
      const srcdoc = createJavaScriptSrcdoc({
        sanitizedDocument: preview.sanitizedDocument,
        css: preview.css,
        nonce: scriptNonce,
        bootstrapToken,
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        viewport: input.viewport,
        runtimeSource: authenticatedRuntimeSource,
      });
      this.#assertCurrent(frame, operation);

      transitionStarted = true;
      if (this.#active !== undefined) {
        const active = this.#active;
        active.bridge.dispose();
        active.execution.dispose();
        this.#disposeResources(this.#restorable?.resources);
        this.#restorable = {
          exerciseSessionId: active.exerciseSessionId,
          executionRevision: active.executionRevision,
          sourceSha256: active.sourceSha256,
          scriptFile: active.scriptFile,
          resources: active.resources,
          srcdoc: active.srcdoc,
          bootstrapToken: active.bootstrapToken,
          viewport: active.viewport,
        };
        this.#active = undefined;
      }
      bridge = new PreviewBridgeClient(
        frame,
        input.exerciseSessionId,
        input.executionRevision,
        bootstrapToken,
        { responseTimeoutMs: this.#executionTimeoutMs },
      );
      execution = new JavaScriptExecutionClient(
        frame,
        input.exerciseSessionId,
        input.executionRevision,
        bootstrapToken,
        { responseTimeoutMs: this.#executionTimeoutMs },
      );
      operation.bridge = bridge;
      operation.execution = execution;
      applyPreviewViewport(frame, input.viewport);
      frame.srcdoc = srcdoc;
      const [, executionPayload] = await Promise.all([
        bridge.waitUntilReady(),
        execution.waitUntilExecuted(),
      ]);
      this.#assertCurrent(frame, operation);

      this.#disposeResources(this.#restorable?.resources);
      this.#restorable = undefined;
      this.#active = {
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        sourceSha256: analysis.sourceSha256,
        scriptFile: validated.scriptFile,
        resources,
        srcdoc,
        bootstrapToken,
        viewport: input.viewport,
        bridge,
        execution,
      };
      if (this.#inFlight === operation) this.#inFlight = undefined;
      return {
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        diagnostics: [
          ...diagnoseSyntax('html', validated.html.htmlSource, validated.html.entryFile),
          ...preview.stylesheets.flatMap((stylesheet) =>
            stylesheet.source === undefined
              ? stylesheet.diagnostics
              : diagnoseSyntax('css', stylesheet.source, stylesheet.file),
          ),
          ...preview.sanitizerDiagnostics,
          ...preview.assetDiagnostics,
          ...executionDiagnostics(executionPayload, validated.scriptFile),
        ],
        evidence: [
          { id: 'javascript.executed', value: executionPayload.executed },
          {
            id: 'javascript.source-sha256',
            file: validated.scriptFile,
            value: analysis.sourceSha256,
          },
          {
            id: 'javascript.budget-exhausted',
            value: executionPayload.budgetExhausted,
          },
        ],
      };
    } catch (error: unknown) {
      bridge?.dispose();
      execution?.dispose();
      this.#disposeResources(resources);
      unownedMaterialized?.dispose();
      if (!this.#isCurrent(frame, operation)) throw renderAbortError();
      if (transitionStarted) await this.#tryRestore(frame, operation);
      if (this.#inFlight === operation) this.#inFlight = undefined;
      return {
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        diagnostics: [systemDiagnostic(error)],
        evidence: [],
      };
    }
  }

  /** 直前のready済みPreviewがあれば同じ認証条件で再読込する。 */
  async #tryRestore(frame: HTMLIFrameElement, operation: InFlightRender): Promise<void> {
    const previous = this.#restorable;
    if (previous === undefined) {
      frame.srcdoc = '';
      return;
    }
    const bridge = new PreviewBridgeClient(
      frame,
      previous.exerciseSessionId,
      previous.executionRevision,
      previous.bootstrapToken,
      { responseTimeoutMs: this.#executionTimeoutMs },
    );
    const execution = new JavaScriptExecutionClient(
      frame,
      previous.exerciseSessionId,
      previous.executionRevision,
      previous.bootstrapToken,
      { responseTimeoutMs: this.#executionTimeoutMs },
    );
    operation.bridge = bridge;
    operation.execution = execution;
    try {
      applyPreviewViewport(frame, previous.viewport);
      frame.srcdoc = previous.srcdoc;
      await Promise.all([bridge.waitUntilReady(), execution.waitUntilExecuted()]);
      this.#assertCurrent(frame, operation);
      this.#active = { ...previous, bridge, execution };
      this.#restorable = undefined;
    } catch {
      bridge.dispose();
      execution.dispose();
      this.#disposeResources(previous.resources);
      this.#restorable = undefined;
      frame.srcdoc = '';
      if (!this.#isCurrent(frame, operation)) throw renderAbortError();
    }
  }

  /** operationが現在のframe・generation・signalと一致するか返す。 */
  #isCurrent(frame: HTMLIFrameElement, operation: InFlightRender): boolean {
    return (
      !operation.controller.signal.aborted &&
      operation.generation === this.#generation &&
      this.#frame === frame &&
      this.#inFlight === operation
    );
  }

  /** operationが最新でなければAbortErrorを投げる。 */
  #assertCurrent(frame: HTMLIFrameElement, operation: InFlightRender): void {
    if (!this.#isCurrent(frame, operation)) throw renderAbortError();
  }

  /** 先行renderの待機と通信Clientを中断する。 */
  #cancelInFlight(): InFlightRender | undefined {
    const pending = this.#inFlight;
    if (pending === undefined) return undefined;
    pending.controller.abort(renderAbortError());
    pending.bridge?.dispose();
    pending.execution?.dispose();
    return pending;
  }

  /** 教材Assetを一度だけ解放する。runtime Blobはopaque iframe自身が解放する。 */
  #disposeResources(resources: RuntimeResources | undefined): void {
    if (resources === undefined) return;
    resources.materialized.dispose();
  }

  /** prepare／dispose共通で現在の処理と全資源を閉じる。 */
  async #reset(clearFrame: boolean): Promise<void> {
    this.#generation += 1;
    const pending = this.#cancelInFlight();
    this.#inFlight = undefined;
    this.#active?.bridge.dispose();
    this.#active?.execution.dispose();
    this.#disposeResources(this.#active?.resources);
    this.#active = undefined;
    this.#disposeResources(this.#restorable?.resources);
    this.#restorable = undefined;
    if (clearFrame && this.#frame !== undefined) this.#frame.srcdoc = '';
    if (pending?.promise !== undefined) await pending.promise.catch(() => undefined);
  }
}
