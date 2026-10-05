function keep(value: number | string): number | string {
  return value;
}
const points = keep(2);
const title = keep('型のクイズ');
console.log(points);
console.log(title);
