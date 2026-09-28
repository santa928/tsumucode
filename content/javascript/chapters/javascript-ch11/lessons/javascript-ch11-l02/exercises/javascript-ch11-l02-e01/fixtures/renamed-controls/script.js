const start = document.querySelector('#start');
const field = document.querySelector('#answer');
const back = document.querySelector('#back');
const question = document.querySelector('#question');
start.addEventListener('click', () => {
  question.textContent = '1 + 1 は？';
  field.value = '';
  field.focus();
});
back.addEventListener('click', () => {
  question.textContent = '始めると問題が出ます';
  field.value = '';
  start.focus();
});
