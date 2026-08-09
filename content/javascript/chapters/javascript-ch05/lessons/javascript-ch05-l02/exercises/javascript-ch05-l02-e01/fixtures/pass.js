const questions = [
  { category: 'HTML', text: 'HTMLの役割は？' },
  { category: 'CSS', text: '文字色を変えるpropertyは？' },
  { category: 'HTML', text: '見出しを作る要素は？' },
];
const htmlQuestions = questions.filter((question) => question.category === 'HTML');
for (const question of htmlQuestions) console.log(question.text);
