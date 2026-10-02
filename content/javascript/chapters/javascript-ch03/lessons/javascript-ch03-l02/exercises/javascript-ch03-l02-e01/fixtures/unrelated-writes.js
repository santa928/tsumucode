function calculateScore(correctAnswers, pointsPerAnswer) {
  return pointsPerAnswer * correctAnswers;
}
function unused(calculateScore) {
  calculateScore = 0;
}
let other = 0;
other = 30;
console.log(calculateScore(3, 10));
calculateScore = function () {
  return 0;
};
