type Result = { kind: 'correct'; points: number } | { kind: 'incorrect'; message: string };
function label(result: Result) {
  if (result.kind === 'correct') {
    return result.points;
  } else {
    return result.message;
  }
}
console.log(label({ kind: 'correct' }));
console.log(label({ kind: 'incorrect', message: 'もう一度' }));
