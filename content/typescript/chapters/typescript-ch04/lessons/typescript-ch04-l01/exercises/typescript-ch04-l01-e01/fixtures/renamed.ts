type Transform = (input: number) => number;
function apply(input: number, operation: Transform): number {
  return operation(input);
}
const double: Transform = (input) => input * 2;
console.log(apply(3, double));
console.log(apply(5, double));
