const form = document.querySelector('#entry');
const field = document.querySelector('#title');
const status = document.querySelector('#status');
const saved = document.querySelector('#saved');
function register(event) {
  event.preventDefault();
  const title = field.value.trim();
  if (title === '') {
    status.textContent = '題名を入力してください';
  } else {
    status.textContent = '登録しました';
    saved.textContent = '登録済み: ' + title;
  }
}
form.addEventListener('submit', register);
