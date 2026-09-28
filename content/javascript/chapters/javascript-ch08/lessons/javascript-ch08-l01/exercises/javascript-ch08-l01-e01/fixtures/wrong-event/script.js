const button = document.querySelector('#open');
const status = document.querySelector('#status');
button.addEventListener('mouseover', () => {
  status.textContent = '本を開きました';
});
