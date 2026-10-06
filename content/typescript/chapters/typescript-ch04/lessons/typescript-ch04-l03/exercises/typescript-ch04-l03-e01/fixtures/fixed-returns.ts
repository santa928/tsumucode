function addPoint(points: readonly number[]): number[] {
  return [1, 2, 3];
}
const original = [1, 2];
const updated = addPoint(original);
original.push(4);
console.log(original.join(','));
console.log(updated.join(','));
