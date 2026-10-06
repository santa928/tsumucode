type Operation = (value: number) => number;
function apply(value: number, operation: Operation): number {
  const result = operation(value);
  return result;
}
const double: Operation = (value) => value * 2;
console.log(apply(3, double));
console.log(apply(5, double));
