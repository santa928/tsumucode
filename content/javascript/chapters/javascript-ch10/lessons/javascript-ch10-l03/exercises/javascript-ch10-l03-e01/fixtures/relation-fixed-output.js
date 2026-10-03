// 同梱の2問を使う教材用関数です。通信はしません。
function loadQuestions(shouldFail) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error('教材用の失敗'));
      } else {
        resolve([{ text: '空は何色？' }, { text: '海は何色？' }]);
      }
    }, 80);
  });
}
const result = document.querySelector('#result');
function showQuestions(shouldFail) {
  loadQuestions(false);
  if (shouldFail) {
    result.textContent = '読み込めませんでした';
  } else {
    result.textContent = '問題: 2';
  }
}
document.querySelector('#success').addEventListener('click', () => showQuestions(false));
document.querySelector('#failure').addEventListener('click', () => showQuestions(true));
