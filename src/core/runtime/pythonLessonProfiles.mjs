/* global TextEncoder */
/** IDと教材構文を固定し、入力からprofileや実行先を選ばせない。 */
export const PYTHON_LESSONS = Object.freeze({
  'python-practice-ch03-l01-e01': {
    courseId: 'python-practice',
    profile: 'dataclass-test-project-v1',
    facts: ['data-project-tested'],
  },
  'python-basics-ch01-l01-e01': {
    profile: 'values-vars-print-v1',
    facts: ['numeric-variable-printed', 'same-variable-addition-printed'],
  },
  'python-basics-ch01-l02-e01': { profile: 'input-echo-v1', facts: ['input-echoed'] },
  'python-basics-ch01-l03-e01': { profile: 'age-branch-v1', facts: ['age-boundary-branched'] },
  'python-basics-ch01-l04-e01': { profile: 'range-loop-v1', facts: ['range-iterated'] },
  'python-basics-ch01-l05-e01': {
    profile: 'list-reference-sum-v1',
    facts: ['list-reference-summed'],
  },
  'python-basics-ch01-l06-e01': { profile: 'dict-value-sum-v1', facts: ['dict-values-summed'] },
  'python-basics-ch01-l07-e01': {
    profile: 'function-return-scope-v1',
    facts: ['function-return-scoped'],
  },
  'python-basics-ch01-l08-e01': { profile: 'module-import-v1', facts: ['module-imported'] },
  'python-basics-ch01-l09-e01': { profile: 'exception-recovery-v1', facts: ['exception-handled'] },
  'python-basics-ch02-l01-e01': { profile: 'console-project-v1', facts: ['project-summed'] },
  'python-practice-ch01-l01-e01': {
    courseId: 'python-practice',
    profile: 'list-comprehension-filter-v1',
    facts: ['list-comprehension-filtered'],
  },
  'python-practice-ch01-l02-e01': {
    courseId: 'python-practice',
    profile: 'iterator-consumption-v1',
    facts: ['iterator-consumed'],
  },
  'python-practice-ch01-l03-e01': {
    courseId: 'python-practice',
    profile: 'generator-lifecycle-v1',
    facts: ['generator-lifecycle'],
  },
  'python-practice-ch02-l01-e01': {
    courseId: 'python-practice',
    profile: 'context-manager-close-v1',
    facts: ['context-managed-closed'],
  },
});

export const PYTHON_FACT_FIELDS = Object.freeze({
  'data-project-tested': 'dataProjectTested',
  'numeric-variable-printed': 'numericVariablePrinted',
  'same-variable-addition-printed': 'sameVariableAdditionPrinted',
  'input-echoed': 'inputEchoed',
  'age-boundary-branched': 'ageBoundaryBranched',
  'range-iterated': 'rangeIterated',
  'list-reference-summed': 'listReferenceSummed',
  'dict-values-summed': 'dictValuesSummed',
  'function-return-scoped': 'functionReturnScoped',
  'module-imported': 'moduleImported',
  'exception-handled': 'exceptionHandled',
  'project-summed': 'projectSummed',
  'list-comprehension-filtered': 'listComprehensionFiltered',
  'iterator-consumed': 'iteratorConsumed',
  'generator-lifecycle': 'generatorLifecycle',
  'context-managed-closed': 'contextManagedClosed',
});

/** 固定2ファイル契約は新3profileだけへ適用し、旧教材を拡張しない。 */
export function isPythonModuleProfile(profile) {
  return ['module-import-v1', 'exception-recovery-v1', 'console-project-v1'].includes(profile);
}

export function pythonSourcePaths(profile) {
  return isPythonModuleProfile(profile) ? ['main.py', 'lesson_tools.py'] : ['main.py'];
}

/** 欠落・余剰・別名を修復せず拒否し、両fileのUTF-8合計に既存上限を適用する。 */
export function validPythonFiles(files, profile) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return false;
  const paths = pythonSourcePaths(profile);
  return (
    Object.keys(files).length === paths.length &&
    paths.every((path) => Object.hasOwn(files, path) && typeof files[path] === 'string') &&
    paths.reduce((bytes, path) => bytes + new TextEncoder().encode(files[path]).byteLength, 0) <=
      100 * 1024
  );
}

/** 新profileのhashは固定順のpathと内容を含め、helperだけの変更も失効させる。 */
export function pythonSourceSnapshot(files, profile) {
  return isPythonModuleProfile(profile)
    ? JSON.stringify(pythonSourcePaths(profile).map((path) => [path, files[path]]))
    : files['main.py'];
}

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
  if (profile === 'dataclass-test-project-v1')
    return 'True\n6\n0\n不正: ValueError\n不正: ValueError\nTest成功\n';
  if (profile === 'values-vars-print-v1') return '3\n5\n';
  if (profile === 'range-loop-v1') return '0\n1\n2\n';
  if (profile === 'list-reference-sum-v1' || profile === 'dict-value-sum-v1') return '4\n9\n';
  if (profile === 'function-return-scope-v1') return '8\n10\n100\n';
  if (profile === 'module-import-v1') return '8\n10\n';
  if (profile === 'list-comprehension-filter-v1') return '[0, 6]\n[]\n';
  if (profile === 'iterator-consumption-v1') return '3\n5\nEND\nEND\n3\nEND\n';
  if (profile === 'context-manager-close-v1')
    return '通常\nFalse\nTrue\n例外\nFalse\n例外を受け止めた\nTrue\n終了後は利用できない\n';
  if (profile === 'generator-lifecycle-v1')
    return '作成済み\n開始\n生成\n6\n生成\n10\nEND\nEND\n空を作成\n開始\nEND\nEND\nまとめて消費\n開始\n生成\n生成\n[6, 10]\nEND\n';
  if (lines.length === 0) return undefined;
  if (profile === 'input-echo-v1') return lines[0] + '\n';
  if (profile === 'age-branch-v1' && /^[+-]?\d+$/u.test(lines[0].trim())) {
    return BigInt(lines[0].trim()) >= 18n ? 'adult\n' : 'child\n';
  }
  return undefined;
}
