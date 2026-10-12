/** Local採点の入力と期待値だけを固定する。作者の解答Sourceは配信しない。 */
const fixtures = {
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
