let score = 0;
function createScoreCounter() {
  return function () {
    score += 10;
    return score;
  };
}

const addScore = createScoreCounter();
console.log(addScore());
console.log(addScore());
console.log(addScore());
