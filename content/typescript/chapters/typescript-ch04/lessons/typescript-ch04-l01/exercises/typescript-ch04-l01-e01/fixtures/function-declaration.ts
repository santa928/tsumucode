type Operation = (value: number) => number;
function apply(value: number, operation: Operation): number {
  return operation(value);
}
function double(value: number): number {
  return value * 2;
}
console.log(apply(3, double));
console.log(apply(5, double));
