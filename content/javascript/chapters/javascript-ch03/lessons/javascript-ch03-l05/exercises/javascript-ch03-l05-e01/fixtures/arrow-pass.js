function createScoreCounter() {
  let score = 0;
  const addScore = () => {
    score += 10;
    return score;
  };
  return addScore;
}

const addScore = createScoreCounter();
console.log(addScore());
console.log(addScore());
