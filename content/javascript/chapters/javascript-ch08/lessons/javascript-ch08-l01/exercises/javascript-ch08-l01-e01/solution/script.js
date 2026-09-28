const button = document.querySelector('#open');
const status = document.querySelector('#status');
button.addEventListener('click', () => {
  status.textContent = '本を開きました';
});
