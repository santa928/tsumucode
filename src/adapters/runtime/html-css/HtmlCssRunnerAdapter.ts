import type {
  PreviewSnapshot,
  PreviewViewport,
  RunnerAdapter,
  RunnerDiagnostic,
  RunnerInput,
  RunnerRenderResult,
  SnapshotRequest,
} from '../../../core/runtime/contracts';
import { createPreviewSrcdoc } from './createSrcdoc';
import { diagnoseSyntax } from './diagnoseSyntax';
import { type MaterializedPreviewAssets } from '../preview-kernel/materializePreviewAssets';
import {
  prepareHtmlCssPreview,
  validateHtmlCssPreviewInput,
  type ValidatedHtmlCssPreviewInput,
} from '../preview-kernel/prepareHtmlCssPreview';
import { PreviewBridgeClient } from './previewProtocol';

interface StoredPreview {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly materialized: MaterializedPreviewAssets;
  readonly srcdoc: string;
  readonly bootstrapToken: string;
  readonly viewport: PreviewViewport;
}

interface ActivePreview extends StoredPreview {
  readonly bridge: PreviewBridgeClient;
}

type RestorablePreview = StoredPreview;

interface InFlightRender {
  readonly generation: number;
  readonly controller: AbortController;
  bridge?: PreviewBridgeClient;
  promise?: Promise<RunnerRenderResult>;
}

/** staleまたはdisposeされた描画を同じError型で終了する。 */
function renderAbortError(): Error {
  return new DOMException('Preview render superseded', 'AbortError');
}

/** 親DocumentでiframeのViewport寸法を確定してからsrcdoc navigationへ進める。 */
function applyPreviewViewport(frame: HTMLIFrameElement, viewport: PreviewViewport): void {
  frame.style.width = `${String(viewport.width)}px`;
  frame.style.height = `${String(viewport.height)}px`;
  frame.getBoundingClientRect();
}

/** HTML/CSSをopaque-origin iframeへ描画し、認証済みSnapshotだけを返す。 */
export class HtmlCssRunnerAdapter implements RunnerAdapter {
  readonly languageId = 'html-css' as const;
  #frame: HTMLIFrameElement | undefined;
  #active: ActivePreview | undefined;
  #restorable: RestorablePreview | undefined;
  #inFlight: InFlightRender | undefined;
  #generation = 0;

  /** 既存処理を解放して、実行scriptだけを許可するiframeを準備する。 */
  async prepare(frame: HTMLIFrameElement): Promise<void> {
    const previousFrame = this.#frame;
    await this.#reset(false);
    if (previousFrame !== undefined) previousFrame.srcdoc = '';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', 'コードのプレビュー');
    frame.srcdoc = '';
    this.#frame = frame;
  }

  /** 最新generationだけをBridge ready後にactive previewとして確定する。 */
  render(input: RunnerInput): Promise<RunnerRenderResult> {
    const frame = this.#frame;
    if (frame === undefined) return Promise.reject(new Error('Runner is not prepared'));
    let prepared: ValidatedHtmlCssPreviewInput;
    try {
      prepared = validateHtmlCssPreviewInput(input);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    this.#cancelInFlight();
    const operation: InFlightRender = {
      generation: ++this.#generation,
      controller: new AbortController(),
    };
    this.#inFlight = operation;
    const promise = this.#performRender(frame, input, prepared, operation);
    operation.promise = promise;
    return promise;
  }

  /** active session・revisionが一致する場合だけBridgeへSnapshotを要求する。 */
  async requestSnapshot(request: SnapshotRequest): Promise<PreviewSnapshot> {
    const active = this.#active;
    if (
      active === undefined ||
      active.exerciseSessionId !== request.exerciseSessionId ||
      active.executionRevision !== request.executionRevision
    ) {
      throw new Error('Preview session or revision is not current');
    }
    return active.bridge.requestSnapshot(request.requestId, request.policy);
  }

  /** in-flight・Bridge・blob URL・frame参照を冪等に解放する。 */
  async dispose(): Promise<void> {
    const frame = this.#frame;
    await this.#reset(true);
    if (frame !== undefined) frame.srcdoc = '';
    this.#frame = undefined;
  }

  /** Asset、sanitizer、Bridgeを統合し、readyを認証してから結果を返す。 */
  async #performRender(
    frame: HTMLIFrameElement,
    input: RunnerInput,
    prepared: ValidatedHtmlCssPreviewInput,
    operation: InFlightRender,
  ): Promise<RunnerRenderResult> {
    let materialized: MaterializedPreviewAssets | undefined;
    let bridge: PreviewBridgeClient | undefined;
    let transitionStarted = false;
    try {
      const preview = await prepareHtmlCssPreview(input, prepared, {
        signal: operation.controller.signal,
      });
      materialized = preview.materialized;
      this.#assertCurrent(frame, operation);
      const htmlSyntaxDiagnostics: RunnerDiagnostic[] = [
        ...diagnoseSyntax('html', prepared.htmlSource, prepared.entryFile),
      ];
      const stylesheetDiagnostics = preview.stylesheets.flatMap((stylesheet) =>
        stylesheet.source === undefined
          ? stylesheet.diagnostics
          : diagnoseSyntax('css', stylesheet.source, stylesheet.file),
      );

      const scriptNonce = crypto.randomUUID().replaceAll('-', '');
      const bootstrapToken = crypto.randomUUID();
      const srcdoc = createPreviewSrcdoc({
        sanitizedDocument: preview.sanitizedDocument,
        css: preview.css,
        nonce: scriptNonce,
        bootstrapToken,
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        viewport: input.viewport,
      });
      this.#assertCurrent(frame, operation);

      transitionStarted = true;
      if (this.#active !== undefined) {
        const active = this.#active;
        active.bridge.dispose();
        this.#restorable?.materialized.dispose();
        this.#restorable = {
          exerciseSessionId: active.exerciseSessionId,
          executionRevision: active.executionRevision,
          materialized: active.materialized,
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
      );
      operation.bridge = bridge;
      applyPreviewViewport(frame, input.viewport);
      frame.srcdoc = srcdoc;
      await bridge.waitUntilReady();
      this.#assertCurrent(frame, operation);

      this.#restorable?.materialized.dispose();
      this.#restorable = undefined;
      this.#active = {
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        bridge,
        materialized,
        srcdoc,
        bootstrapToken,
        viewport: input.viewport,
      };
      if (this.#inFlight === operation) this.#inFlight = undefined;
      return {
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        diagnostics: [
          ...htmlSyntaxDiagnostics,
          ...stylesheetDiagnostics,
          ...preview.sanitizerDiagnostics,
          ...preview.assetDiagnostics,
        ],
      };
    } catch (error) {
      bridge?.dispose();
      materialized?.dispose();
      if (!this.#isCurrent(frame, operation)) {
        throw renderAbortError();
      }
      if (transitionStarted) {
        try {
          await this.#restorePreviousPreview(frame, operation);
        } catch (restoreError) {
          if (!this.#isCurrent(frame, operation)) throw renderAbortError();
          this.#restorable?.materialized.dispose();
          this.#restorable = undefined;
          this.#inFlight = undefined;
          frame.srcdoc = '';
          const primaryError = error instanceof Error ? error : new Error(String(error));
          const restorationError =
            restoreError instanceof Error ? restoreError : new Error(String(restoreError));
          throw new AggregateError(
            [primaryError, restorationError],
            'Preview render failed and the previous preview could not be restored',
            { cause: restoreError },
          );
        }
      }
      if (this.#inFlight === operation) this.#inFlight = undefined;
      throw error;
    }
  }

  /** 失敗した新renderの代わりに最後にready済みだったPreviewを再読込する。 */
  async #restorePreviousPreview(
    frame: HTMLIFrameElement,
    operation: InFlightRender,
  ): Promise<void> {
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
    );
    operation.bridge = bridge;
    try {
      applyPreviewViewport(frame, previous.viewport);
      frame.srcdoc = previous.srcdoc;
      await bridge.waitUntilReady();
      this.#assertCurrent(frame, operation);
      this.#active = { ...previous, bridge };
      this.#restorable = undefined;
    } catch (error) {
      bridge.dispose();
      throw error;
    }
  }

  /** operationが現在のframe・generation・signalを保っているか返す。 */
  #isCurrent(frame: HTMLIFrameElement, operation: InFlightRender): boolean {
    return (
      !operation.controller.signal.aborted &&
      operation.generation === this.#generation &&
      this.#frame === frame &&
      this.#inFlight === operation
    );
  }

  /** operationが現在のframe・generation・signalを保っているか確認する。 */
  #assertCurrent(frame: HTMLIFrameElement, operation: InFlightRender): void {
    if (!this.#isCurrent(frame, operation)) throw renderAbortError();
  }

  /** 先行renderのfetchとBridge待機を中断する。 */
  #cancelInFlight(): InFlightRender | undefined {
    const pending = this.#inFlight;
    if (pending === undefined) return undefined;
    pending.controller.abort(renderAbortError());
    pending.bridge?.dispose();
    return pending;
  }

  /** prepare/dispose共通で処理とactive資源を閉じる。 */
  async #reset(clearFrame: boolean): Promise<void> {
    this.#generation += 1;
    const pending = this.#cancelInFlight();
    this.#inFlight = undefined;
    this.#active?.bridge.dispose();
    this.#active?.materialized.dispose();
    this.#active = undefined;
    this.#restorable?.materialized.dispose();
    this.#restorable = undefined;
    if (clearFrame && this.#frame !== undefined) this.#frame.srcdoc = '';
    if (pending?.promise !== undefined) await pending.promise.catch(() => undefined);
  }
}
