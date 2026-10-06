function addPoint(points: readonly number[]): number[] {
  // 括弧を残し、式の受け入れを確認する。
  // prettier-ignore
  return [...(points), (3)];
}
// prettier-ignore
const original = ([1, 2]);
// prettier-ignore
const updated = addPoint((original));
// prettier-ignore
original.push((4));
// prettier-ignore
console.log(original.join((',')));
// prettier-ignore
console.log(updated.join((',')));
