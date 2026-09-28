const form = document.querySelector('#entry');
const field = document.querySelector('#title');
const status = document.querySelector('#status');
document.querySelector('#save').addEventListener('click', (event) => {
  event.preventDefault();
  status.textContent = '登録: ' + field.value;
});
