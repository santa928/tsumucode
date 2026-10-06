function addPoint(points: readonly number[]): number[] {
  return [...points, 3];
}
const original = [1, 2];
const updated = addPoint(['1']);
original.push(4);
console.log(original.join(','));
console.log(updated.join(','));
