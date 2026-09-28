const button = document.querySelector('#toggle');
const hint = document.querySelector('#hint');
let opened = false;
function render() {
  if (opened) {
    hint.removeAttribute('hidden');
  } else {
    hint.setAttribute('hidden', '');
  }
  if (opened) {
    button.textContent = 'ヒントを閉じる';
  } else {
    button.textContent = 'ヒントを開く';
  }
  button.setAttribute('aria-expanded', String(opened));
}
button.addEventListener('click', () => {
  opened = !opened;
  render();
});
render();
