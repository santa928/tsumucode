const form = document.querySelector('#entry');
const field = document.querySelector('#title');
const status = document.querySelector('#status');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  document.querySelector('#note').textContent = '変更';
  status.textContent = '登録: ' + field.value;
});
