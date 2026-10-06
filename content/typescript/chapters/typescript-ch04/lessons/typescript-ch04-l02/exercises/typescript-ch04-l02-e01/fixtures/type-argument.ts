function keep<T>(value: T): T {
  return value;
}
const points: number = keep<number>(2);
const title: string = keep<string>('型のクイズ');
console.log(points);
console.log(title);
