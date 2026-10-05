type Result = { kind: 'correct'; points: number } | { kind: 'incorrect'; message: string };
function label(result: Result) {
  if (result.kind === 'correct') {
    return result.points;
  } else {
    return result.message;
  }
}
console.log(label({ kind: 'correct', points: 2 }));
console.log(label({ kind: 'incorrect', message: 'もう一度' }));
