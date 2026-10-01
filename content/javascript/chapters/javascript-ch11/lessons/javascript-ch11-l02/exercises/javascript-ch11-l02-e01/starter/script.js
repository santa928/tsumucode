const start = document.querySelector('#start');
const answer = document.querySelector('#answer');
const back = document.querySelector('#back');
const question = document.querySelector('#question');
start.addEventListener('click', () => {
  question.textContent = '1 + 1 は？';
  answer.value = '';
  // 回答欄へFocusを移す
});
back.addEventListener('click', () => {
  question.textContent = '始めると問題が出ます';
  answer.value = '';
  // 開始ボタンへFocusを戻す
});
