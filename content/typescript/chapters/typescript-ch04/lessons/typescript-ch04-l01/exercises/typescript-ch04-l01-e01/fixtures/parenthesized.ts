type Operation = (value: number) => number;
function apply(value: number, operation: Operation): number {
  // 括弧を残し、式の受け入れを確認する。
  // prettier-ignore
  return operation((value));
}
// prettier-ignore
const double: Operation = (value) => (value) * (2);
// prettier-ignore
console.log(apply((3), (double)));
// prettier-ignore
console.log(apply((5), (double)));
