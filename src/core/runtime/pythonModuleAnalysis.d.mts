export interface PythonModuleAnalysis {
  readonly analysisVersion: 1;
  readonly state: 'supported' | 'unsupported' | 'syntax-error';
  readonly supported: boolean;
  readonly numericVariablePrinted: boolean;
  readonly sameVariableAdditionPrinted: boolean;
  readonly moduleImported: boolean;
  readonly exceptionHandled: boolean;
  readonly projectSummed: boolean;
  readonly expectedOutput: string | null;
  readonly syntaxFile: 'main.py' | 'lesson_tools.py' | null;
  readonly syntaxMessage: string | null;
}
export function pythonModuleAnalysis(
  files: Readonly<Record<string, string>>,
  profile: string,
  inputLines?: readonly string[],
): string;
export function parsePythonModuleAnalysis(value: unknown): PythonModuleAnalysis;
