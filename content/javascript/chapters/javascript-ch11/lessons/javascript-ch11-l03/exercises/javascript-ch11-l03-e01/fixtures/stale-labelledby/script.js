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
  button.setAttribute('aria-expanded', String(opened));
  button.setAttribute('aria-label', button.textContent);
}
button.addEventListener('click', () => {
  opened = !opened;
  render();
});
render();

const fixedName = document.createElement('span');
fixedName.setAttribute('id', 'fixed-name');
fixedName.textContent = 'ヒントを開く';
document.body.append(fixedName);
button.setAttribute('aria-labelledby', 'fixed-name');
