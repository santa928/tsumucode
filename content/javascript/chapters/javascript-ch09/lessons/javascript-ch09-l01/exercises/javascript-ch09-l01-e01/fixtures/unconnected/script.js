const button = document.querySelector('#done');
const status = document.querySelector('#status');
let count = 0;
button.addEventListener('input', () => {
  count = count + 1;
  status.textContent = '読了数: ' + count;
});
