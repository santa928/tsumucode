import type {
  PreviewSnapshot,
  RunnerAdapter,
  RunnerInput,
  RunnerRenderResult,
} from '../../src/core/runtime/contracts';

/** Registryの言語非依存性を検証する最小の第2言語Runner。 */
export class FixtureRunner implements RunnerAdapter {
  readonly languageId = 'fixture';
  readonly renders: RunnerInput[] = [];
  #frame: HTMLIFrameElement | undefined;

  /** Test用frameを保持する。 */
  async prepare(frame: HTMLIFrameElement): Promise<void> {
    this.#frame = frame;
  }

  /** 入力を記録し、同じidentityを返す。 */
  async render(input: RunnerInput): Promise<RunnerRenderResult> {
    if (this.#frame === undefined) throw new Error('Fixture runner is not prepared');
    this.renders.push(input);
    return {
      exerciseSessionId: input.exerciseSessionId,
      executionRevision: input.executionRevision,
      diagnostics: [],
    };
  }

  /** Testで不要なSnapshot要求を明示的に拒否する。 */
  async requestSnapshot(): Promise<PreviewSnapshot> {
    throw new Error('Fixture runner does not support snapshots');
  }

  /** Test用frame参照を解放する。 */
  async dispose(): Promise<void> {
    this.#frame = undefined;
  }
}
