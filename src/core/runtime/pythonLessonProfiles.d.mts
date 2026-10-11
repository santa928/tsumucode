export type PythonLessonProfile =
  | 'values-vars-print-v1'
  | 'input-echo-v1'
  | 'age-branch-v1'
  | 'range-loop-v1'
  | 'list-reference-sum-v1'
  | 'dict-value-sum-v1'
  | 'function-return-scope-v1';
export type PythonSourceFact =
  | 'numeric-variable-printed'
  | 'same-variable-addition-printed'
  | 'input-echoed'
  | 'age-boundary-branched'
  | 'range-iterated'
  | 'list-reference-summed'
  | 'dict-values-summed'
  | 'function-return-scoped';
export const PYTHON_LESSONS: Readonly<
  Record<
    string,
    { readonly profile: PythonLessonProfile; readonly facts: readonly PythonSourceFact[] }
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
  >
>;
/** 行数・UTF-8 bytes・制御文字の共通入力境界。 */
export function validPythonInputLines(value: unknown): value is readonly string[];
export function expectedPythonOutput(
  profile: PythonLessonProfile,
  lines: readonly string[],
): string | undefined;
