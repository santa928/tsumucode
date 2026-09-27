let score = 0;
function createScoreCounter(step) {
  return function () {
    score += step;
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
