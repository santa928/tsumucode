const questions = ['HTMLとは？', 'CSSとは？', 'JavaScriptとは？'];

const labels = questions.map((question) => {
  return `問題: ${question}`;
});

for (const label of labels) {
  console.log(label);
}
