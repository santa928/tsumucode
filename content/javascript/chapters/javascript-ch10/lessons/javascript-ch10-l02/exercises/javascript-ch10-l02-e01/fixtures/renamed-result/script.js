function loadQuestions() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([{ text: '空は何色？' }, { text: '海は何色？' }]);
    }, 80);
  });
}
const count = document.querySelector('#count');
async function showCount() {
  const items = await loadQuestions();
  count.textContent = '問題: ' + items.length;
}
document.querySelector('#load').addEventListener('click', showCount);
