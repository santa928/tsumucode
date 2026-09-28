const field = document.querySelector('#title');
const status = document.querySelector('#status');
field.addEventListener('input', () => {
  status.textContent = '読みたい本: ' + field.value;
});
