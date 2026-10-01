import type { RunnerDiagnostic } from '../../../core/runtime/contracts';
import { mapTypeScriptDiagnostics } from './mapTypeScriptDiagnostics';
import { JavaScriptAnalyzerClient } from '../javascript/analyzer/JavaScriptAnalyzerClient';
import type {
  JavaScriptCapabilityProfileId,
  JavaScriptWorkspaceAnalysisInput,
  JavaScriptWorkspaceAnalysisResult,
} from '../javascript/analyzer/contracts';
import { TypeScriptCompilerClient } from './TypeScriptCompilerClient';
import type { TypeScriptCompileResult, TypeScriptDiagnostic } from './compileTypeScript';
import { isTypeScriptCompileInput, type TypeScriptCompileInput } from './workerContract';

export interface TypeScriptPreparationInput extends TypeScriptCompileInput {
  readonly entryFile: string;
  readonly capabilityProfile: JavaScriptCapabilityProfileId;
  readonly guardIdentifier: string;
}

/** compile診断は元TS、analysis診断とfactsは生成JSの位置。元TS位置と混同しない。 */
export type TypeScriptPreparationResult =
  | {
      readonly stage: 'compile';
      readonly result: Exclude<TypeScriptCompileResult, { status: 'ready' }>;
    }
  | {
      readonly stage: 'environment';
      readonly result: {
        readonly status: 'environment-error';
        readonly diagnostics: readonly TypeScriptDiagnostic[];
      };
    }
  | {
      readonly stage: 'analysis';
      readonly result: JavaScriptWorkspaceAnalysisResult;
      readonly sourceDiagnostics: readonly RunnerDiagnostic[];
    };

interface CompilerPort {
  compile(input: TypeScriptCompileInput): Promise<TypeScriptCompileResult>;
  dispose(): void;
}
interface AnalysisPort {
  analyze(input: JavaScriptWorkspaceAnalysisInput): Promise<JavaScriptWorkspaceAnalysisResult>;
  dispose(): Promise<void>;
}
interface PreparationOptions {
  readonly compilerFactory?: () => CompilerPort;
  readonly analyzerFactory?: () => AnalysisPort;
}
interface PendingPreparation {
  readonly reject: (error: Error) => void;
  compiler?: CompilerPort;
  analyzer?: AnalysisPort;
}

/** 型検査成功だけを実行許可にせず、生成JSを既存Analyzerへ必ず渡す準備境界。 */
export class TypeScriptPreparationClient {
  readonly #options: PreparationOptions;
  #pending: PendingPreparation | undefined;
  #disposed = false;

  constructor(options: PreparationOptions = {}) {
    this.#options = options;
  }

  /** 入力を固定し、置換時は両Workerを破棄する。実行・採点・保存は行わない。 */
  prepare(input: TypeScriptPreparationInput): Promise<TypeScriptPreparationResult> {
    if (this.#disposed)
      return Promise.reject(new DOMException('Preparation disposed', 'AbortError'));
    this.cancel();
    if (!isTypeScriptCompileInput(input) || !Object.hasOwn(input.files, input.entryFile)) {
      return Promise.resolve({
        stage: 'compile',
        result: {
          status: 'invalid-input',
          diagnostics: [{ code: 0, message: '開始するTypeScriptファイルを確認してください。' }],
        },
      });
    }
    const snapshot = { ...input, files: { ...input.files } };
    return new Promise((resolve, reject) => {
      const pending: PendingPreparation = { reject };
      this.#pending = pending;
      void this.#prepare(snapshot, pending).then(
        (result) => {
          if (this.#pending !== pending) return;
          this.#release(pending);
          resolve(result);
        },
        () => {
          if (this.#pending !== pending) return;
          this.#release(pending);
          resolve({
            stage: 'environment',
            result: {
              status: 'environment-error',
              diagnostics: [
                {
                  code: 0,
                  message: '実行の準備を完了できませんでした。コードを保持して再試行してください。',
                },
              ],
            },
          });
        },
      );
    });
  }

  /** 中止は即座に確定し、完了直前の古いcompile/analysisも次段へ進めない。 */
  cancel(): void {
    const pending = this.#pending;
    if (!pending) return;
    this.#release(pending);
    pending.reject(new DOMException('Preparation cancelled', 'AbortError'));
  }

  /** 画面離脱後は再使用せず、計算と解析の両方を止める。 */
  dispose(): void {
    this.#disposed = true;
    this.cancel();
  }

  /** 拡張子だけを対応付け、import解決・危険操作・計算予算は既存Analyzerに委ねる。 */
  async #prepare(
    input: TypeScriptPreparationInput,
    pending: PendingPreparation,
  ): Promise<TypeScriptPreparationResult> {
    const compiler = this.#options.compilerFactory?.() ?? new TypeScriptCompilerClient();
    pending.compiler = compiler;
    const compiled = await compiler.compile(input);
    if (this.#pending !== pending) throw new DOMException('Preparation cancelled', 'AbortError');
    if (compiled.status !== 'ready') return { stage: 'compile', result: compiled };
    const analyzer = this.#options.analyzerFactory?.() ?? new JavaScriptAnalyzerClient();
    pending.analyzer = analyzer;
    const result = await analyzer.analyze({
      exerciseSessionId: input.sessionId,
      executionRevision: input.revision,
      entryFile: input.entryFile.replace(/\.ts$/u, '.js'),
      files: compiled.files,
      sourceType: 'module',
      capabilityProfile: input.capabilityProfile,
      guardIdentifier: input.guardIdentifier,
    });
    if (this.#pending !== pending) throw new DOMException('Preparation cancelled', 'AbortError');
    return {
      stage: 'analysis',
      result,
      sourceDiagnostics: mapTypeScriptDiagnostics(
        result.diagnostics,
        compiled.sourceMaps,
        input.files,
      ),
    };
  }

  /** 同じ要求の資源だけを解放。Analyzer.disposeは保留Promiseも拒否する。 */
  #release(pending: PendingPreparation): void {
    this.#pending = undefined;
    pending.compiler?.dispose();
    void pending.analyzer?.dispose();
  }
}
