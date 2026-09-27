function createScoreCounter() {
  let score = 0;
  return function () {
    score += 10;
    return score;
  };
}

const addScore = createScoreCounter();
console.log(10);
console.log(20);
console.log(30);
