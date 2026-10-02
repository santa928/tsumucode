let reads = 0;
/** 同梱データを読み、2回目以降は別の3件を返す教材用取得元。 */
function loadQuestions() {
  reads += 1;
  const questions =
    reads === 1
      ? [{ text: '空は何色？' }, { text: '海は何色？' }]
      : [{ text: '草は何色？' }, { text: '雲は何色？' }, { text: '雪は何色？' }];
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(questions);
    }, 80);
  });
}
const count = document.querySelector('#count');
document.querySelector('#load').addEventListener('click', () => {
  loadQuestions().then((questions) => {
    count.textContent = '問題: ' + questions.length;
  });
});
