function createScoreCounter() {
  return function () {
    let score = 0;
    score += 10;
    return score;
  };
}

const addScore = createScoreCounter();
console.log(addScore());
console.log(addScore());
console.log(addScore());
