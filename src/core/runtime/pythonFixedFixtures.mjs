/** Local採点の入力と期待値だけを固定する。作者の解答Sourceは配信しない。 */
const fixtures = {
  'function-decorator-flow-v1': [
    [
      'decorator-observation',
      [],
      'False\n呼出 1\n5\n呼出 2\n5\n呼出 1\n7\n呼出 3\n負の値\n呼出 4\n2\n呼出 2\n8\n',
    ],
  ],
  'wraps-metadata-preserved-v1': [
    [
      'decorator-observation',
      [],
      'False\nTrue\nTrue\nTrue\n呼出 1\n5\n呼出 2\n5\n呼出 1\n7\n呼出 3\n負の値\n呼出 4\n2\n呼出 2\n8\n',
    ],
  ],
  'inheritance-delegation-v1': [['object-protocol', [], '6\n9\n6\n8\n10\n9\n']],
  'validated-property-v1': [
    ['object-protocol', [], '70\n90\n50\n範囲外\n90\n範囲外\n90\n0\n100\n初期値も範囲外\n'],
  ],
  'length-string-protocol-v1': [['object-protocol', [], '2\n本:2\n2\n3\n本:3\n0\n本:0\n']],
  'class-instance-lookup-v1': [
    ['identity-and-lookup', [], 'True\nFalse\n3\n5\n2\n2\n7\n2\n2\n7\n4\n'],
  ],
  'method-binding-comparison-v1': [
    ['three-methods', [], '6\n6\n6\n6\n10\n10\n10\n10\n12\n12\n12\n6\n'],
  ],
  'dataclass-test-project-v1': [
    ['normal-invalid-empty', [], 'True\n6\n0\n不正: ValueError\n不正: ValueError\nTest成功\n'],
  ],
  'values-vars-print-v1': [['values', [], '3\n5\n']],
  'input-echo-v1': [
    ['name', ['Ada'], 'Ada\n'],
    ['empty', [''], '\n'],
    ['unicode', ['葵'], '葵\n'],
  ],
  'age-branch-v1': [
    ['under-boundary', ['17'], 'child\n'],
    ['at-boundary', ['18'], 'adult\n'],
  ],
  'range-loop-v1': [['range', [], '0\n1\n2\n']],
  'list-reference-sum-v1': [['list', [], '4\n9\n']],
  'dict-value-sum-v1': [['dict', [], '4\n9\n']],
  'function-return-scope-v1': [['function', [], '8\n10\n100\n']],
  'module-import-v1': [['module', [], '8\n10\n']],
  'list-comprehension-filter-v1': [['normal-and-empty', [], '[0, 6]\n[]\n']],
  'iterator-consumption-v1': [['consume-and-recreate', [], '3\n5\nEND\nEND\n3\nEND\n']],
  'context-manager-close-v1': [
    [
      'normal-and-exception-close',
      [],
      '通常\nFalse\nTrue\n例外\nFalse\n例外を受け止めた\nTrue\n終了後は利用できない\n',
    ],
  ],
  'generator-lifecycle-v1': [
    [
      'lazy-and-exhausted',
      [],
      '作成済み\n開始\n生成\n6\n生成\n10\nEND\nEND\n空を作成\n開始\nEND\nEND\nまとめて消費\n開始\n生成\n生成\n[6, 10]\nEND\n',
    ],
  ],
  'exception-recovery-v1': [
    ['integer', ['5'], '5\n終了\n'],
    ['invalid', ['five'], '整数を入力してください\n終了\n'],
  ],
  'console-project-v1': [
    ['sum', ['4', '6'], '10\n終了\n'],
    ['invalid-first', ['five', '6'], '整数を入力してください\n終了\n'],
    ['invalid-second', ['4', 'six'], '整数を入力してください\n終了\n'],
  ],
};

/** 空suiteや未知profileを合格へ変換せず、固定集合を返す。 */
export function pythonFixedFixtures(profile) {
  const selected = fixtures[profile];
  if (!selected?.length) throw new Error('固定採点に未対応のPython教材です。');
  return selected.map(([id, inputLines, expectedOutput]) => ({
    id,
    inputLines: [...inputLines],
    expectedOutput,
  }));
}
