function readQuestion(question) {
  if (question.text === '') throw new Error('空です');
  return question.text;
}
try {
  console.log(readQuestion({ text: '' }));
} catch (error) {
  console.log(error.message);
}
