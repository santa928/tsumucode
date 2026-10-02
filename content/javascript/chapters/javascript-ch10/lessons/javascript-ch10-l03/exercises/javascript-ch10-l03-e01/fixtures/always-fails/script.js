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
async function showQuestions(shouldFail) {
  try {
    const questions = await loadQuestions(true);
    result.textContent = '問題: ' + questions.length;
  } catch (error) {
    result.textContent = '読み込めませんでした';
  }
}
document.querySelector('#success').addEventListener('click', () => showQuestions(false));
document.querySelector('#failure').addEventListener('click', () => showQuestions(true));
