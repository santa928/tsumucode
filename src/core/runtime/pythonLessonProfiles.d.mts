export type PythonLessonProfile =
  | 'values-vars-print-v1'
  | 'input-echo-v1'
  | 'age-branch-v1'
  | 'range-loop-v1'
  | 'list-reference-sum-v1'
  | 'dict-value-sum-v1'
  | 'function-return-scope-v1'
  | 'module-import-v1'
  | 'exception-recovery-v1'
  | 'console-project-v1'
  | 'list-comprehension-filter-v1'
  | 'iterator-consumption-v1'
  | 'generator-lifecycle-v1'
  | 'context-manager-close-v1'
  | 'dataclass-test-project-v1'
  | 'class-instance-lookup-v1'
  | 'method-binding-comparison-v1';
export type PythonSourceFact =
  | 'numeric-variable-printed'
  | 'same-variable-addition-printed'
  | 'input-echoed'
  | 'age-boundary-branched'
  | 'range-iterated'
  | 'list-reference-summed'
  | 'dict-values-summed'
  | 'function-return-scoped'
  | 'module-imported'
  | 'exception-handled'
  | 'project-summed'
  | 'list-comprehension-filtered'
  | 'iterator-consumed'
  | 'generator-lifecycle'
  | 'context-managed-closed'
  | 'data-project-tested'
  | 'class-instance-compared'
  | 'methods-compared';
export const PYTHON_LESSONS: Readonly<
  Record<
    string,
    {
      readonly profile: PythonLessonProfile;
      readonly facts: readonly PythonSourceFact[];
      readonly courseId?: 'python-practice' | 'python-oop';
    }
  >
>;
export const PYTHON_FACT_FIELDS: Readonly<
  Record<
    PythonSourceFact,
    | 'numericVariablePrinted'
    | 'sameVariableAdditionPrinted'
    | 'inputEchoed'
    | 'ageBoundaryBranched'
    | 'rangeIterated'
    | 'listReferenceSummed'
    | 'dictValuesSummed'
    | 'functionReturnScoped'
    | 'moduleImported'
    | 'exceptionHandled'
    | 'projectSummed'
    | 'listComprehensionFiltered'
    | 'iteratorConsumed'
    | 'generatorLifecycle'
    | 'contextManagedClosed'
    | 'dataProjectTested'
    | 'classInstanceCompared'
    | 'methodsCompared'
  >
>;
/** 行数・UTF-8 bytes・制御文字の共通入力境界。 */
export function validPythonInputLines(value: unknown): value is readonly string[];
export function isPythonModuleProfile(profile: string): boolean;
export function pythonSourcePaths(profile: string): string[];
export function validPythonFiles(files: unknown, profile: string): files is Record<string, string>;
export function pythonSourceSnapshot(
  files: Readonly<Record<string, string>>,
  profile: string,
): string;
export function expectedPythonOutput(
  profile: PythonLessonProfile,
  lines: readonly string[],
): string | undefined;
