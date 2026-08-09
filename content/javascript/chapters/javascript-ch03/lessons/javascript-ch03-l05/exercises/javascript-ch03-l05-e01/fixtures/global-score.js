let score = 0;

function createScoreCounter() {
  const addScore = function () {
    score += 10;
    return score;
  };
  return addScore;
}

const addScore = createScoreCounter();
console.log(addScore());
console.log(addScore());
