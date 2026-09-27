function createScoreCounter(step) {
  let score = 0;
  return function () {
    score += 10;
    return score;
  };
}

const a = createScoreCounter(2);
const b = createScoreCounter(5);
console.log(a());
console.log(b());
console.log(a());
console.log(b());
console.log(a());
