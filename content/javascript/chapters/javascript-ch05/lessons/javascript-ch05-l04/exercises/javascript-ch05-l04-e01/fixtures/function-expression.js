const questions = [{ text: 'HTMLの役割は？', answered: false }];
const answeredQuestions = questions.map(function (question) {
  return { ...question, answered: true };
});
console.log(questions[0].answered);
console.log(answeredQuestions[0].answered);
