const keep = <T>(value: T): T => value;
const points: number = keep(2);
const title: string = keep('型のクイズ');
console.log(points);
console.log(title);
