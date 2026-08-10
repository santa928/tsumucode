function readQuestion(question) {
  if (question.text === '') throw new Error('問題文がありません');
  return question.text;
}
readQuestion({ text: '' });
