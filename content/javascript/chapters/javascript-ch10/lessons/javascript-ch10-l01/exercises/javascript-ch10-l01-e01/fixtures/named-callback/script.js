function loadQuestions() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([{ text: '空は何色？' }, { text: '海は何色？' }]);
    }, 80);
  });
}
const count = document.querySelector('#count');
const question = document.querySelector('#question');
document.querySelector('#load').addEventListener('click', () => {
  function show(items) {
    count.textContent = '問題: ' + items.length;
    question.textContent = items[0].text;
  }
  loadQuestions().then(show);
});
