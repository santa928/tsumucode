const state = { count: 0 };
const button = document.querySelector('#done');
const reset = document.querySelector('#reset');
const status = document.querySelector('#status');
const next = document.querySelector('#next');
function render() {
  state.count = state.count + 1;
  status.textContent = '読了数: ' + state.count;
  next.textContent = '次は' + (state.count + 1) + '冊目';
}
render();
button.addEventListener('click', () => {
  state.count = state.count + 1;
  render();
});
reset.addEventListener('click', () => {
  state.count = 0;
  render();
});
