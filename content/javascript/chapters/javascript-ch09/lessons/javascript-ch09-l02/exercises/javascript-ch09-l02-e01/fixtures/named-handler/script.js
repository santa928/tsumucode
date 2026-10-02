const state = { count: 0 };
const button = document.querySelector('#done');
const reset = document.querySelector('#reset');
const status = document.querySelector('#status');
const next = document.querySelector('#next');
function render() {
  status.textContent = '読了数: ' + state.count;
  next.textContent = '次は' + (state.count + 1) + '冊目';
}
render();
function markRead() {
  state.count = state.count + 1;
  render();
}
button.addEventListener('click', markRead);
reset.addEventListener('click', () => {
  state.count = 0;
  render();
});
