// 同梱の2問を使う教材用関数です。通信はしません。
function loadQuestions(shouldFail) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error('教材用の失敗'));
      } else {
        resolve([{ text: '空は何色？' }, { text: '海は何色？' }]);
      }
    }, 250);
  });
}
const result = document.querySelector('#result');
const success = document.querySelector('#success');
const failure = document.querySelector('#failure');
let loading = false;
async function showQuestions(shouldFail) {
  if (loading) return;
  loading = true;
  success.disabled = true;
  failure.disabled = true;
  result.textContent = '読み込み中...';
  try {
    const questions = await loadQuestions(shouldFail);
    result.textContent = '問題: ' + questions.length;
  } catch (error) {
    result.textContent = '読み込めませんでした';
  } finally {
    loading = false;
    success.disabled = false;
    failure.disabled = false;
  }
}
success.addEventListener('click', () => showQuestions(false));
failure.addEventListener('click', () => showQuestions(true));
