const questions = [
  { category: 'HTML', text: 'HTMLの役割は？' },
  { category: 'CSS', text: '文字色を変えるpropertyは？' },
  { category: 'HTML', text: '見出しを作る要素は？' },
];
const htmlQuestions = questions.filter((question) => question.category !== 'HTML');
console.log('HTMLの役割は？');
console.log('見出しを作る要素は？');
