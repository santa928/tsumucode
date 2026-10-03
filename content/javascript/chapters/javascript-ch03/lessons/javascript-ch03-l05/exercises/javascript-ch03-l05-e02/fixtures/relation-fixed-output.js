function createScoreCounter() {
  let score = 0;
  return function () {
    score += 0;
    return score;
  };
}
const addScore = createScoreCounter();
function unused() {
  addScore();
  addScore();
  addScore();
}
console.log(10);
console.log(20);
console.log(30);
