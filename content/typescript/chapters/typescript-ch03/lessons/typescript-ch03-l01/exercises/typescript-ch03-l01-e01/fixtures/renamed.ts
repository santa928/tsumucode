type Entry = { kind: 'correct'; points: number } | { kind: 'incorrect'; message: string };
function describe(item: Entry) {
  if (item.kind === 'correct') {
    return item.points;
  } else {
    return item.message;
  }
}
console.log(describe({ kind: 'correct', points: 2 }));
console.log(describe({ kind: 'incorrect', message: 'もう一度' }));
