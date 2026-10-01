const start = document.querySelector('#start');
const answer = document.querySelector('#answer');
const back = document.querySelector('#back');
const question = document.querySelector('#question');
function begin() {
  question.textContent = '1 + 1 は？';
  answer.value = '';
  answer.focus();
}
function finish() {
  question.textContent = '始めると問題が出ます';
  answer.value = '';
  start.focus();
}
start.addEventListener('click', begin);
back.addEventListener('click', finish);
