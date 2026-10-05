type Result = { kind: 'correct'; points: number } | { kind: 'incorrect'; message: string };
function label(result: Result) {
  return result.kind === 'correct' ? result.points : result.message;
}
console.log(label({ kind: 'correct', points: 2 }));
console.log(label({ kind: 'incorrect', message: 'もう一度' }));
