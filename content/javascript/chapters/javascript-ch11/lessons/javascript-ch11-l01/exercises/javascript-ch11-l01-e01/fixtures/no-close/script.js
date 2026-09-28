const button = document.querySelector('#open');
const hint = document.querySelector('#hint');
function showHint() {
  hint.textContent = '配列のlengthで問題数が分かります';
}
function closeHint() {
  hint.textContent = 'ヒントは閉じています';
}
button.addEventListener('click', showHint);
