function addPoint(points: readonly number[]): number[] {
  const result = [...points, 3];
  return result;
}
const original = [1, 2];
const updated = addPoint(original);
original.push(4);
console.log(original.join(','));
console.log(updated.join(','));
