const form = document.querySelector('#entry');
const field = document.querySelector('#title');
const status = document.querySelector('#status');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  status.textContent = '登録: ' + '春の本';
});
