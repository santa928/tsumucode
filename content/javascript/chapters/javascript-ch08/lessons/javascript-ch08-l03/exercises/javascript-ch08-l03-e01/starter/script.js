const form = document.querySelector('#entry');
const field = document.querySelector('#title');
const status = document.querySelector('#status');
form.addEventListener('submit', (event) => {
  // ここで標準の送信を止める
  status.textContent = '登録: ' + field.value;
});
