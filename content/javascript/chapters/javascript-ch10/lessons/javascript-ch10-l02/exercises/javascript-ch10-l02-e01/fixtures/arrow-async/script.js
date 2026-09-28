function loadQuestions() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([{ text: '空は何色？' }, { text: '海は何色？' }]);
    }, 80);
  });
}
const count = document.querySelector('#count');
const showCount = async () => {
  const questions = await loadQuestions();
  count.textContent = '問題: ' + questions.length;
};
document.querySelector('#load').addEventListener('click', showCount);
