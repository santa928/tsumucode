function readQuestion(question) {
  if (question.text === '') {
    throw new Error('問題文がありません');
  }
  return question.text;
}

try {
  console.log(readQuestion({ text: '' }));
} catch (error) {
  console.log(error.message);
}
