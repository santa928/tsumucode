const questions = [
  { category: 'HTML', text: 'HTMLの役割は？' },
  { category: 'CSS', text: '文字色を変えるpropertyは？' },
  { category: 'HTML', text: '見出しを作る要素は？' },
];
for (const question of questions) {
  if (question.category === 'HTML') console.log(question.text);
}
