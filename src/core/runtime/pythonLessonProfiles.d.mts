export type PythonLessonProfile =
  | 'values-vars-print-v1'
  | 'input-echo-v1'
  | 'age-branch-v1'
  | 'range-loop-v1'
  | 'list-reference-sum-v1'
  | 'dict-value-sum-v1'
  | 'function-call-v1'
  | 'function-arguments-v1'
  | 'function-result-v1'
  | 'function-print-return-v1'
  | 'function-scope-v2'
  | 'module-import-v1'
  | 'exception-recovery-v1'
  | 'console-project-v1'
  | 'list-comprehension-filter-v1'
  | 'iterator-consumption-v1'
  | 'generator-lifecycle-v1'
  | 'context-manager-close-v1'
  | 'dataclass-test-project-v1'
  | 'class-instance-lookup-v1'
  | 'method-binding-comparison-v1'
  | 'inheritance-delegation-v1'
  | 'validated-property-v1'
  | 'length-string-protocol-v1'
  | 'function-decorator-flow-v1'
  | 'wraps-metadata-preserved-v1'
  | 'configured-decorator-v1'
  | 'decorator-ledger-project-v1';
export type PythonSourceFact =
  | 'numeric-variable-printed'
  | 'same-variable-addition-printed'
  | 'input-echoed'
  | 'age-boundary-branched'
  | 'range-iterated'
  | 'list-reference-summed'
  | 'dict-values-summed'
  | 'function-behavior-verified'
  | 'module-imported'
  | 'exception-handled'
  | 'project-summed'
  | 'list-comprehension-filtered'
  | 'iterator-consumed'
  | 'generator-lifecycle'
  | 'context-managed-closed'
  | 'data-project-tested'
  | 'class-instance-compared'
  | 'methods-compared'
  | 'inheritance-delegation-compared'
  | 'property-range-validated'
  | 'dunder-protocols-used'
  | 'decorator-flow-compared'
  | 'wraps-metadata-preserved'
  | 'configured-decorator-compared'
  | 'decorator-project-recorded';
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
    | 'functionBehaviorVerified'
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
    | 'inheritanceDelegationCompared'
    | 'propertyRangeValidated'
    | 'dunderProtocolsUsed'
    | 'decoratorFlowCompared'
    | 'wrapsMetadataPreserved'
    | 'configuredDecoratorCompared'
    | 'decoratorProjectRecorded'
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

export function isPythonObjectProtocolProfile(profile: string): boolean;
export function isPythonOopProfile(profile: string): boolean;
export function isPythonDecoratorProfile(profile: string): boolean;

export function isPythonDecoratorFactoryProfile(profile: string): boolean;
