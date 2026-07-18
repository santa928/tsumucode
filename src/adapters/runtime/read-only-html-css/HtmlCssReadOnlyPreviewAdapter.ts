import type { ReadOnlyPreviewAdapter, RunnerInput } from '../../../core/runtime/contracts';
import { createStaticPreviewSrcdoc } from '../preview-kernel/createStaticSrcdoc';
import type { MaterializedPreviewAssets } from '../preview-kernel/materializePreviewAssets';
import {
  prepareHtmlCssPreview,
  validateHtmlCssPreviewInput,
  type ValidatedHtmlCssPreviewInput,
} from '../preview-kernel/prepareHtmlCssPreview';

interface InFlightRender {
  readonly generation: number;
  readonly controller: AbortController;
  promise?: Promise<void>;
}

/** staleまたはdisposeされた静的描画を同じError型で終了する。 */
function renderAbortError(): Error {
  return new DOMException('Read-only Preview render superseded', 'AbortError');
}

/** HTML/CSS完了コード用の静的Preview adapter。 */
export class HtmlCssReadOnlyPreviewAdapter implements ReadOnlyPreviewAdapter {
  readonly languageId = 'html-css' as const;
  #frame: HTMLIFrameElement | undefined;
  #active: MaterializedPreviewAssets | undefined;
  #inFlight: InFlightRender | undefined;
  #generation = 0;

  /** script権限なしのopaque-origin frameへ初期化し、以前の資源を解放する。 */
  async prepare(frame: HTMLIFrameElement): Promise<void> {
    frame.setAttribute('sandbox', '');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', 'コードのプレビュー');
    frame.srcdoc = '';
    const previousFrame = this.#frame;
    await this.#reset(false);
    if (previousFrame !== undefined) previousFrame.srcdoc = '';
    this.#frame = frame;
  }

  /** 最新generationだけを共有kernelで静的srcdocへ変換する。 */
  render(input: RunnerInput): Promise<void> {
    const frame = this.#frame;
    if (frame === undefined) return Promise.reject(new Error('Read-only Preview is not prepared'));
    let validated: ValidatedHtmlCssPreviewInput;
    try {
      validated = validateHtmlCssPreviewInput(input);
    } catch (error) {
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

  /** in-flight取得・blob URL・frame参照を冪等に解放する。 */
  async dispose(): Promise<void> {
    const frame = this.#frame;
    await this.#reset(true);
    if (frame !== undefined) frame.srcdoc = '';
    this.#frame = undefined;
  }

  /** learner sourceを直接連結せず、共有kernelのsanitized Documentだけを描画する。 */
  async #performRender(
    frame: HTMLIFrameElement,
    input: RunnerInput,
    validated: ValidatedHtmlCssPreviewInput,
    operation: InFlightRender,
  ): Promise<void> {
    let materialized: MaterializedPreviewAssets | undefined;
    try {
      const preview = await prepareHtmlCssPreview(input, validated, {
        signal: operation.controller.signal,
      });
      materialized = preview.materialized;
      this.#assertCurrent(frame, operation);
      const srcdoc = createStaticPreviewSrcdoc({
        sanitizedDocument: preview.sanitizedDocument,
        css: preview.css,
      });
      this.#assertCurrent(frame, operation);

      const previous = this.#active;
      frame.style.width = `${String(input.viewport.width)}px`;
      frame.style.height = `${String(input.viewport.height)}px`;
      frame.srcdoc = srcdoc;
      this.#active = materialized;
      materialized = undefined;
      previous?.dispose();
      if (this.#inFlight === operation) this.#inFlight = undefined;
    } catch (error) {
      materialized?.dispose();
      if (!this.#isCurrent(frame, operation)) throw renderAbortError();
      if (this.#inFlight === operation) this.#inFlight = undefined;
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

  /** staleな非同期結果をsrcdocへ反映する前に拒否する。 */
  #assertCurrent(frame: HTMLIFrameElement, operation: InFlightRender): void {
    if (!this.#isCurrent(frame, operation)) throw renderAbortError();
  }

  /** 先行renderのAsset取得を中断する。 */
  #cancelInFlight(): InFlightRender | undefined {
    const pending = this.#inFlight;
    if (pending === undefined) return undefined;
    pending.controller.abort(renderAbortError());
    return pending;
  }

  /** prepare/dispose共通でin-flight処理とactive blob URLを閉じる。 */
  async #reset(clearFrame: boolean): Promise<void> {
    this.#generation += 1;
    const pending = this.#cancelInFlight();
    this.#inFlight = undefined;
    if (pending?.promise !== undefined) await pending.promise.catch(() => undefined);
    this.#active?.dispose();
    this.#active = undefined;
    if (clearFrame && this.#frame !== undefined) this.#frame.srcdoc = '';
  }
}
