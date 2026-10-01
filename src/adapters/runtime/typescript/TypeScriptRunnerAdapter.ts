import { z } from 'zod';
import { TypeScriptExerciseRuntimeSchema } from '../../../core/content/schema';
import type {
  InteractionRequest,
  InteractionResult,
  PreviewSnapshot,
  RunnerAdapter,
  RunnerDiagnostic,
  RunnerInput,
  RunnerRenderResult,
  SnapshotRequest,
} from '../../../core/runtime/contracts';
import { JavaScriptRunnerAdapter } from '../javascript/runner/JavaScriptRunnerAdapter';
import { TypeScriptCompilerClient } from './TypeScriptCompilerClient';
import type { TypeScriptCompileResult } from './compileTypeScript';
import { mapTypeScriptDiagnostics } from './mapTypeScriptDiagnostics';
import { isTypeScriptCompileInput, type TypeScriptCompileInput } from './workerContract';
import { typeScriptSourceHash } from './typeScriptSourceHash';

const optionsSchema = z
  .object({
    runtime: TypeScriptExerciseRuntimeSchema,
  })
  .strict();
interface CompilerPort {
  compile(input: TypeScriptCompileInput): Promise<TypeScriptCompileResult>;
  dispose(): void;
}
interface RunnerOptions {
  readonly compilerFactory?: () => CompilerPort;
  readonly runnerFactory?: () => RunnerAdapter;
}
interface SourceContext {
  readonly maps: Readonly<Record<string, string>>;
  readonly files: Readonly<Record<string, string>>;
}
/** 型検査成功後だけ既存JS Runnerへ渡す。登録・採点・保存を行わないTS専用adapter。 */
export class TypeScriptRunnerAdapter implements RunnerAdapter {
  readonly languageId = 'typescript';
  #frame: HTMLIFrameElement | undefined;
  #compiler: CompilerPort | undefined;
  #runner: RunnerAdapter | undefined;
  #source: SourceContext | undefined;
  #generation = 0;
  #disposed = false;
  #cleanup = Promise.resolve();
  #reject: ((error: Error) => void) | undefined;
  constructor(private readonly options: RunnerOptions = {}) {}

  /** 前の隔離環境を解放し、次の描画先を保持する。 */
  async prepare(frame: HTMLIFrameElement): Promise<void> {
    this.#invalidate();
    const generation = this.#generation;
    this.#frame = undefined;
    await this.#cleanup;
    this.#assertCurrent(generation);
    this.#frame = frame;
  }

  /** 古いPreviewも停止してから型検査する。型エラー時に前の実行結果を再利用しない。 */
  render(input: RunnerInput): Promise<RunnerRenderResult> {
    this.#invalidate();
    const generation = this.#generation;
    const frame = this.#frame;
    if (this.#disposed || !frame) return Promise.reject(this.#abort());
    const snapshot = {
      ...input,
      files: { ...input.files },
      assets: input.assets.map((asset) => ({ ...asset })),
      viewport: { ...input.viewport },
    };
    const runtime = optionsSchema.safeParse(input.options);
    const cancelled = new Promise<never>((_resolve, reject) => {
      this.#reject = reject;
    });
    const operation = (async (): Promise<RunnerRenderResult> => {
      await this.#cleanup;
      this.#assertCurrent(generation);
      const files = Object.fromEntries(
        Object.entries(snapshot.files).filter(([file]) => file.endsWith('.ts')),
      );
      const compileInput = {
        sessionId: snapshot.exerciseSessionId,
        revision: snapshot.executionRevision,
        files,
      };
      if (
        snapshot.languageId !== this.languageId ||
        !runtime.success ||
        !isTypeScriptCompileInput(compileInput) ||
        !Object.hasOwn(files, runtime.data.runtime.entryFile) ||
        Object.keys(snapshot.files).some((file) => !/\.(?:ts|html|css)$/u.test(file))
      ) {
        return this.#failure(snapshot, [
          {
            code: 'typescript-input',
            kind: 'system',
            severity: 'error',
            message: 'Invalid TypeScript preview input',
            learnerMessage: 'TypeScriptの実行設定を確認してください。採点していません。',
          },
        ]);
      }
      const compiler = this.options.compilerFactory?.() ?? new TypeScriptCompilerClient();
      this.#compiler = compiler;
      const compiled = await compiler.compile(compileInput);
      this.#assertCurrent(generation);
      compiler.dispose();
      this.#compiler = undefined;
      if (compiled.status !== 'ready')
        return this.#failure(
          snapshot,
          compiled.diagnostics.map((item) => ({
            ...item,
            code: `typescript-${compiled.status}-${String(item.code)}`,
            kind:
              compiled.status === 'type-error'
                ? 'reference'
                : compiled.status === 'syntax-error'
                  ? 'syntax'
                  : 'system',
            severity: 'error',
            learnerMessage: item.message,
          })),
        );
      const sourceHash = await typeScriptSourceHash(
        snapshot.files,
        runtime.data.runtime,
        snapshot.exerciseSessionId,
        snapshot.executionRevision,
      );
      this.#assertCurrent(generation);
      const runner = this.options.runnerFactory?.() ?? new JavaScriptRunnerAdapter();
      this.#runner = runner;
      await runner.prepare(frame);
      this.#assertCurrent(generation);
      const result = await runner.render({
        ...snapshot,
        languageId: 'javascript',
        files: {
          ...Object.fromEntries(
            Object.entries(snapshot.files).filter(([file]) => !file.endsWith('.ts')),
          ),
          ...compiled.files,
        },
        options: {
          runtime: {
            ...runtime.data.runtime,
            kind: 'javascript',
            entryFile: runtime.data.runtime.entryFile.replace(/\.ts$/u, '.js'),
          },
        },
      });
      this.#assertCurrent(generation);
      if (
        result.exerciseSessionId !== snapshot.exerciseSessionId ||
        result.executionRevision !== snapshot.executionRevision
      )
        throw new Error('TypeScript runner identity mismatch');
      this.#source = { maps: compiled.sourceMaps, files };
      return {
        ...result,
        diagnostics: this.#map(result.diagnostics),
        evidence: [...result.evidence, { id: 'typescript.source-sha256', value: sourceHash }],
      };
    })();
    return Promise.race([operation, cancelled]).finally(() => {
      if (generation === this.#generation) {
        this.#reject = undefined;
        this.#compiler?.dispose();
        this.#compiler = undefined;
      }
    });
  }

  /** 同じactive runの認証済みSnapshotだけを既存Runnerから取得する。 */
  async requestSnapshot(request: SnapshotRequest): Promise<PreviewSnapshot> {
    const generation = this.#generation;
    if (!this.#source || !this.#runner) throw this.#abort();
    const result = await this.#runner.requestSnapshot(request);
    this.#assertCurrent(generation);
    return {
      ...result,
      ...(result.runtimeObservation
        ? {
            runtimeObservation: {
              ...result.runtimeObservation,
              diagnostics: this.#map(result.runtimeObservation.diagnostics),
            },
          }
        : {}),
    };
  }

  /** Interaction診断も元TSへ戻し、停止・置換後の応答は返さない。 */
  async interact(request: InteractionRequest): Promise<InteractionResult> {
    const generation = this.#generation;
    if (!this.#source || !this.#runner?.interact) throw this.#abort();
    const result = await this.#runner.interact(request);
    this.#assertCurrent(generation);
    return {
      ...result,
      ...(result.diagnostics ? { diagnostics: this.#map(result.diagnostics) } : {}),
    };
  }

  /** 中止を即座に確定し、両Worker・iframeの解放完了まで待つ。 */
  async stop(): Promise<void> {
    this.#invalidate();
    this.#frame = undefined;
    await this.#cleanup;
  }
  /** 最終破棄後はprepare/renderを再開しない。 */
  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.stop();
  }
  /** 生成JSのevidence/hashは改名せず、診断だけ対応可能なTS位置へ戻す。 */
  #map(diagnostics: readonly RunnerDiagnostic[]): readonly RunnerDiagnostic[] {
    const source = this.#source;
    return source
      ? diagnostics.flatMap((item) =>
          item.file?.endsWith('.js')
            ? mapTypeScriptDiagnostics([item], source.maps, source.files)
            : [item],
        )
      : diagnostics;
  }
  /** 失敗を実行証拠なしで返す。型エラーと基盤障害はcode/kindで区別する。 */
  #failure(input: RunnerInput, diagnostics: readonly RunnerDiagnostic[]): RunnerRenderResult {
    return {
      exerciseSessionId: input.exerciseSessionId,
      executionRevision: input.executionRevision,
      diagnostics,
      console: [],
      evidence: [],
    };
  }
  /** 旧要求の資源を切り離し、次の要求より先に解放する。 */
  #invalidate(): void {
    ++this.#generation;
    this.#reject?.(this.#abort());
    this.#reject = undefined;
    this.#compiler?.dispose();
    this.#compiler = undefined;
    const runner = this.#runner;
    this.#runner = undefined;
    this.#source = undefined;
    if (runner) this.#cleanup = this.#cleanup.then(() => runner.dispose());
  }
  /** 非同期境界で要求置換・画面離脱を判定する。 */
  #assertCurrent(generation: number): void {
    if (this.#disposed || generation !== this.#generation) throw this.#abort();
  }
  /** 取消を基盤エラーや学習者不正解と混ぜない。 */
  #abort(): Error {
    return new DOMException('TypeScript preview superseded', 'AbortError');
  }
}
