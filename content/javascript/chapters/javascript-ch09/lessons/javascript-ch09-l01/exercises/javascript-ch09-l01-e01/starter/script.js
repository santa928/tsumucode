const button = document.querySelector('#done');
const status = document.querySelector('#status');
button.addEventListener('click', () => {
  let count = 0;
  count = count + 1;
  status.textContent = '読了数: ' + count;
});
