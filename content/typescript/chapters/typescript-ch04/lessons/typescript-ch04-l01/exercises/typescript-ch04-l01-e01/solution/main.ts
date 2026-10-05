type Operation = (value: number) => number;
function apply(value: number, operation: Operation): number {
  return operation(value);
}
const double: Operation = (value) => value * 2;
console.log(apply(3, double));
console.log(apply(5, double));
