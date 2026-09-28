const field = document.querySelector('#title');
const status = document.querySelector('#status');
field.addEventListener('input', (event) => {
  status.textContent = '読みたい本: ' + '春の本';
});
