// Product UI can display the engine version only after an execution result exists.
export function beforeGradeLabel(value) {
  return typeof value === 'string' && /^ローカル CPython(?: 3\.14\.2)?で実行$/u.test(value);
}
export function afterGradeLabel(value) {
  return value === 'ローカル CPython 3.14.2で実行';
}
