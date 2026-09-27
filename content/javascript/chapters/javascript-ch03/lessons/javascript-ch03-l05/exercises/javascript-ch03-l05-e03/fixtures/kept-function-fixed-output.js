function createScoreCounter(step) {
  let score = 0;
  return function () {
    score += step;
    return score;
  };
}

const a = createScoreCounter(2);
const b = createScoreCounter(5);
console.log(2);
console.log(5);
console.log(4);
console.log(10);
console.log(6);
