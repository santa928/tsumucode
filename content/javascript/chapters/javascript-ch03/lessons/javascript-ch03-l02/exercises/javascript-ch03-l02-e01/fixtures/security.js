function calculateScore(correctAnswers, pointsPerAnswer) {
  return eval('correctAnswers * pointsPerAnswer');
}

console.log(calculateScore(3, 10));
