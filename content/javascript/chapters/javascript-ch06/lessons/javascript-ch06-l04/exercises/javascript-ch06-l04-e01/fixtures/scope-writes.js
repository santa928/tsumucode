const questionCount = 3;
const pointsPerQuestion = 10;
for (var totalScore = pointsPerQuestion * questionCount; false;) {}
for (let totalScore = 0; totalScore < 1; totalScore++) {}
try {
  throw 0;
} catch (totalScore) {
  totalScore = 1;
}
function unused() {
  var totalScore = 0;
  totalScore = 1;
}
console.log('期待値:', 30);
console.log('実際値:', totalScore);
