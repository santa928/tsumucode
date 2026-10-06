function keep<T>(value: T): T {
  // 括弧を残し、式の受け入れを確認する。
  // prettier-ignore
  return (value);
}
// prettier-ignore
const points: number = keep((2));
// prettier-ignore
const title: string = keep(('型のクイズ'));
// prettier-ignore
console.log((points));
// prettier-ignore
console.log((title));
