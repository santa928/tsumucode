function addPoint(points: number[]): number[] {
  points.push(3);
  return [...points];
}
const original = [1, 2];
const updated = addPoint(original);
original.push(4);
console.log(original.join(','));
console.log(updated.join(','));
