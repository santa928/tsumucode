const form = document.querySelector('#entry');
const field = document.querySelector('#title');
const status = document.querySelector('#status');
function register(event) {
  event.preventDefault();
  status.textContent = '登録: ' + field.value;
}
form.addEventListener('submit', register);
