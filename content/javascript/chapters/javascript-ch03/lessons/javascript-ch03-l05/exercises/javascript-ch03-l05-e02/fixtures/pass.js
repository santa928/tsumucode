function createScoreCounter() {
  let score = 0;
  return function () {
    score += 10;
    return score;
  };
}

const addScore = createScoreCounter();
console.log(addScore());
console.log(addScore());
console.log(addScore());
