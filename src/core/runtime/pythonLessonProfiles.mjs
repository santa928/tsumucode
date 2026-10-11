/* global TextEncoder */
/** IDと教材構文を固定し、入力からprofileや実行先を選ばせない。 */
export const PYTHON_LESSONS = Object.freeze({
  'python-basics-ch01-l01-e01': {
    profile: 'values-vars-print-v1',
    facts: ['numeric-variable-printed', 'same-variable-addition-printed'],
  },
  'python-basics-ch01-l02-e01': { profile: 'input-echo-v1', facts: ['input-echoed'] },
  'python-basics-ch01-l03-e01': { profile: 'age-branch-v1', facts: ['age-boundary-branched'] },
  'python-basics-ch01-l04-e01': { profile: 'range-loop-v1', facts: ['range-iterated'] },
});

export const PYTHON_FACT_FIELDS = Object.freeze({
  'numeric-variable-printed': 'numericVariablePrinted',
  'same-variable-addition-printed': 'sameVariableAdditionPrinted',
  'input-echoed': 'inputEchoed',
  'age-boundary-branched': 'ageBoundaryBranched',
  'range-iterated': 'rangeIterated',
});

/** 空文字は1回分の空入力。改行を行区切り以外として渡さず、bytesと行数を制限する。 */
export function validPythonInputLines(value) {
  return (
    Array.isArray(value) &&
    value.length <= 16 &&
    value.every(
      (line) =>
        typeof line === 'string' &&
        [...line].every((character) => {
          const code = character.charCodeAt(0);
          return (code >= 32 && code !== 127) || character === '\t';
        }),
    ) &&
    new TextEncoder().encode(value.join('\n')).byteLength <= 1024
  );
}

/** 実入力に対応する表示を照合する。採点できない入力を模擬合格へ変換しない。 */
export function expectedPythonOutput(profile, lines) {
  if (profile === 'values-vars-print-v1') return '3\n5\n';
  if (profile === 'range-loop-v1') return '0\n1\n2\n';
  if (lines.length === 0) return undefined;
  if (profile === 'input-echo-v1') return lines[0] + '\n';
  if (profile === 'age-branch-v1' && /^[+-]?\d+$/u.test(lines[0].trim())) {
    return BigInt(lines[0].trim()) >= 18n ? 'adult\n' : 'child\n';
  }
  return undefined;
}
