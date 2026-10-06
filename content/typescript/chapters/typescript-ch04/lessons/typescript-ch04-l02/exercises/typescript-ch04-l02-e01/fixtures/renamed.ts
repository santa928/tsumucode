function build<T>(input: T): T {
  return input;
}
const points: number = build(2);
const title: string = build('型のクイズ');
console.log(points);
console.log(title);
