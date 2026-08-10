function readQuestion(question) {
  if (question.text === '') {
    throw new Error('ここを書き換えます');
  }
  return question.text;
}

try {
  console.log(readQuestion({ text: '' }));
} catch (error) {
  console.log(error.message);
}
