const field = document.querySelector('#title');
const status = document.querySelector('#status');
field.addEventListener('change', (event) => {
  status.textContent = '読みたい本: ' + event.currentTarget.value;
});
