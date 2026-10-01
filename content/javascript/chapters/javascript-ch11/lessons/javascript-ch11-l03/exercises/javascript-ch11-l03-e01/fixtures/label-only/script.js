const button = document.querySelector('#toggle');
const hint = document.querySelector('#hint');
let opened = false;
function render() {
  if (opened) {
    hint.removeAttribute('hidden');
  } else {
    hint.setAttribute('hidden', '');
  }
  button.textContent = opened ? 'ヒントを閉じる' : 'ヒントを開く';
  button.setAttribute('aria-expanded', 'false');
}
button.addEventListener('click', () => {
  opened = !opened;
  render();
});
render();
