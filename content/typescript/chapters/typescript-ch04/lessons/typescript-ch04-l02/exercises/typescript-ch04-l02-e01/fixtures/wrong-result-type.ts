function keep<T>(value: T): T {
  return value;
}
const points: string = keep(2);
const title: string = keep('型のクイズ');
console.log(points);
console.log(title);
