/** Python専用の固定coreとprivate portで交換するbounded結果。公開Courseへはまだ登録しない。 */
export interface PythonCore {
  readonly workerSource: string;
  readonly wasm: ArrayBuffer;
  readonly stdlib: ArrayBuffer;
  readonly lock: Readonly<Record<string, unknown>>;
}

export interface PythonResult {
  readonly type: 'python-result';
  readonly status: 'succeeded' | 'code-error' | 'unsupported' | 'stopped' | 'system-error';
  readonly stdout: string;
  readonly stderr: string;
  readonly rows: readonly { readonly level: 'log' | 'error'; readonly text: string }[];
  readonly version?: string;
  readonly error?: string;
  readonly reason?: 'syntax' | 'runtime' | 'output-limit' | 'time-limit' | 'manual-stop';
  readonly numericVariablePrinted?: boolean;
  readonly sameVariableAdditionPrinted?: boolean;
}

export const PYTHON_LIMITS = {
  sourceBytes: 100 * 1024,
  outputBytes: 64 * 1024,
  lineBytes: 4096,
  lines: 100,
  preparationMilliseconds: 20_000,
  initializationMilliseconds: 15_000,
  executionMilliseconds: 1500,
} as const;
