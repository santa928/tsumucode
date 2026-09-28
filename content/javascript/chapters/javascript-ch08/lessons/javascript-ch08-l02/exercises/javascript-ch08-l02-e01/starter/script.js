const field = document.querySelector('#title');
const status = document.querySelector('#status');
const firstValue = field.value;
field.addEventListener('input', () => {
  status.textContent = '読みたい本: ' + firstValue;
});
