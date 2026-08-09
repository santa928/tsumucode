const questions = [{ points: 10 }, { points: 20 }, { points: 30 }];
const total = questions.reduce((sum, question) => sum + question.points, 0;
console.log(total);
