function createScoreCounter() {
  const addScore = function () {
    let score = 0;
    score += 10;
    return score;
  };
  return addScore;
}

const addScore = createScoreCounter();
console.log(addScore());
console.log(addScore());
