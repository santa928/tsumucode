const questions = [{ points: 10 }, { points: 20 }, { points: 30 }];
let total = 0;
for (const question of questions) total += question.points;
console.log(total);
