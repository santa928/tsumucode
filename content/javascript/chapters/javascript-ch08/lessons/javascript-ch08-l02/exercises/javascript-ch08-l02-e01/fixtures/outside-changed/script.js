const field = document.querySelector('#title');
const status = document.querySelector('#status');
field.addEventListener('input', (event) => {
  document.querySelector('#note').textContent = '変更';
  status.textContent = '読みたい本: ' + event.currentTarget.value;
});
