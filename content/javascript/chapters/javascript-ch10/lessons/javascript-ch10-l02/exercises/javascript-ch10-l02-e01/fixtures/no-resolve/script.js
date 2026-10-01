function loadQuestions() {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 結果を渡していません
    }, 80);
  });
}
const count = document.querySelector('#count');
async function showCount() {
  const questions = await loadQuestions();
  count.textContent = '問題: ' + questions.length;
}
document.querySelector('#load').addEventListener('click', showCount);
