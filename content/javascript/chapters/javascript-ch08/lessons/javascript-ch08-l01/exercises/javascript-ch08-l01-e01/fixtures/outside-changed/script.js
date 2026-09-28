const button = document.querySelector('#open');
const status = document.querySelector('#status');
button.addEventListener('click', () => {
  document.querySelector('#note').textContent = '変更しました';
  status.textContent = '本を開きました';
});
