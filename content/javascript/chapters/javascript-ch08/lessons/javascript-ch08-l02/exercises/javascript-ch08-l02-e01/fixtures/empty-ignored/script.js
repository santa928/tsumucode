const field = document.querySelector('#title');
const status = document.querySelector('#status');
field.addEventListener('input', (event) => {
  if (event.currentTarget.value === '') return;
  status.textContent = '読みたい本: ' + event.currentTarget.value;
});
