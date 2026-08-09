const questions = [{ text: 'HTMLの役割は？', answered: false }];
const answeredQuestions = questions.map((question) => ({ ...question, answered: true );
console.log(answeredQuestions[0].answered);
