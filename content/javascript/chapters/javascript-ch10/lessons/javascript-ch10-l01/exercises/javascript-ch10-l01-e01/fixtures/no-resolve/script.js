function loadQuestions() {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 結果を渡していません
    }, 80);
  });
}
const count = document.querySelector('#count');
const question = document.querySelector('#question');
document.querySelector('#load').addEventListener('click', () => {
  loadQuestions().then((questions) => {
    count.textContent = '問題: ' + questions.length;
    question.textContent = questions[0].text;
  });
});
