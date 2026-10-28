/** Python専用の固定coreとprivate portで交換するbounded結果。公開Courseへはまだ登録しない。 */
export interface PythonCore {
  readonly workerSource: string;
  readonly wasm: ArrayBuffer;
  readonly stdlib: ArrayBuffer;
  readonly lock: Readonly<Record<string, unknown>>;
}

/** 復号後の固定asset取得量。圧縮Content-Lengthや残り時間とは混ぜない。 */
export interface PythonCoreProgress {
  readonly stage: 'download' | 'verify';
  readonly receivedBytes: number;
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
  readonly file?: 'main.py' | 'lesson_tools.py';
  readonly numericVariablePrinted?: boolean;
  readonly sameVariableAdditionPrinted?: boolean;
  readonly inputEchoed?: boolean;
  readonly ageBoundaryBranched?: boolean;
  readonly rangeIterated?: boolean;
  readonly listReferenceSummed?: boolean;
  readonly dictValuesSummed?: boolean;
  readonly functionBehaviorVerified?: boolean;
  readonly moduleImported?: boolean;
  readonly exceptionHandled?: boolean;
  readonly projectSummed?: boolean;
  readonly listComprehensionFiltered?: boolean;
  readonly iteratorConsumed?: boolean;
  readonly generatorLifecycle?: boolean;
  readonly contextManagedClosed?: boolean;
  readonly dataProjectTested?: boolean;
  readonly classInstanceCompared?: boolean;
  readonly methodsCompared?: boolean;
  readonly inheritanceDelegationCompared?: boolean;
  readonly propertyRangeValidated?: boolean;
  readonly dunderProtocolsUsed?: boolean;
  readonly decoratorFlowCompared?: boolean;
  readonly wrapsMetadataPreserved?: boolean;
  readonly configuredDecoratorCompared?: boolean;
  readonly decoratorProjectRecorded?: boolean;
  readonly expectedOutput?: string | null;
}

export const PYTHON_LIMITS = {
  sourceBytes: 100 * 1024,
  outputBytes: 64 * 1024,
  lineBytes: 4096,
  lines: 100,
  preparationMilliseconds: 20_000,
  downloadMilliseconds: 90_000,
  initializationMilliseconds: 15_000,
  executionMilliseconds: 1500,
} as const;
