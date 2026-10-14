/* global TextEncoder */
/** IDと教材構文を固定し、入力からprofileや実行先を選ばせない。 */
export const PYTHON_LESSONS = Object.freeze({
  'python-oop-ch03-l01-e01': {
    courseId: 'python-oop',
    profile: 'function-decorator-flow-v1',
    facts: ['decorator-flow-compared'],
  },
  'python-oop-ch03-l02-e01': {
    courseId: 'python-oop',
    profile: 'wraps-metadata-preserved-v1',
    facts: ['wraps-metadata-preserved'],
  },
  'python-oop-ch02-l01-e01': {
    courseId: 'python-oop',
    profile: 'inheritance-delegation-v1',
    facts: ['inheritance-delegation-compared'],
  },
  'python-oop-ch02-l02-e01': {
    courseId: 'python-oop',
    profile: 'validated-property-v1',
    facts: ['property-range-validated'],
  },
  'python-oop-ch02-l03-e01': {
    courseId: 'python-oop',
    profile: 'length-string-protocol-v1',
    facts: ['dunder-protocols-used'],
  },
  'python-oop-ch01-l01-e01': {
    courseId: 'python-oop',
    profile: 'class-instance-lookup-v1',
    facts: ['class-instance-compared'],
  },
  'python-oop-ch01-l02-e01': {
    courseId: 'python-oop',
    profile: 'method-binding-comparison-v1',
    facts: ['methods-compared'],
  },
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
  'decorator-flow-compared': 'decoratorFlowCompared',
  'wraps-metadata-preserved': 'wrapsMetadataPreserved',
  'inheritance-delegation-compared': 'inheritanceDelegationCompared',
  'property-range-validated': 'propertyRangeValidated',
  'dunder-protocols-used': 'dunderProtocolsUsed',
  'class-instance-compared': 'classInstanceCompared',
  'methods-compared': 'methodsCompared',
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
  if (profile === 'function-decorator-flow-v1')
    return 'False\n呼出 1\n5\n呼出 2\n5\n呼出 1\n7\n呼出 3\n負の値\n呼出 4\n2\n呼出 2\n8\n';
  if (profile === 'wraps-metadata-preserved-v1')
    return 'False\nTrue\nTrue\nTrue\n呼出 1\n5\n呼出 2\n5\n呼出 1\n7\n呼出 3\n負の値\n呼出 4\n2\n呼出 2\n8\n';
  if (profile === 'inheritance-delegation-v1') return '6\n9\n6\n8\n10\n9\n';
  if (profile === 'validated-property-v1')
    return '70\n90\n50\n範囲外\n90\n範囲外\n90\n0\n100\n初期値も範囲外\n';
  if (profile === 'length-string-protocol-v1') return '2\n本:2\n2\n3\n本:3\n0\n本:0\n';
  if (profile === 'class-instance-lookup-v1') return 'True\nFalse\n3\n5\n2\n2\n7\n2\n2\n7\n4\n';
  if (profile === 'method-binding-comparison-v1')
    return '6\n6\n6\n6\n10\n10\n10\n10\n12\n12\n12\n6\n';
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

/** 追加3教材の構文・packetを、既存のmethod比較教材から分ける。 */
export function isPythonObjectProtocolProfile(profile) {
  return [
    'inheritance-delegation-v1',
    'validated-property-v1',
    'length-string-protocol-v1',
  ].includes(profile);
}

/** 固定decorator教材だけへFunction変換とmetadataの解析を適用する。 */
export function isPythonDecoratorProfile(profile) {
  return ['function-decorator-flow-v1', 'wraps-metadata-preserved-v1'].includes(profile);
}

/** OOPの未対応構文とSyntaxErrorの事前分類を共有する。 */
export function isPythonOopProfile(profile) {
  return (
    isPythonDecoratorProfile(profile) ||
    isPythonObjectProtocolProfile(profile) ||
    ['class-instance-lookup-v1', 'method-binding-comparison-v1'].includes(profile)
  );
}
