const button = document.querySelector('#toggle');
const hint = document.querySelector('#hint');
let expanded = false;
function render() {
  if (expanded) {
    hint.removeAttribute('hidden');
  } else {
    hint.setAttribute('hidden', '');
  }
  button.textContent = expanded ? 'ヒントを閉じる' : 'ヒントを開く';
  button.setAttribute('aria-expanded', String(expanded));
}
button.addEventListener('click', () => {
  expanded = !expanded;
  render();
});
render();
