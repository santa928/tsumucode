function createScoreCounter() {
  let score = 0;
  const addScore = function () {
    score += eval('10');
    return score;
  };
  return addScore;
}

const addScore = createScoreCounter();
console.log(addScore());
console.log(addScore());
