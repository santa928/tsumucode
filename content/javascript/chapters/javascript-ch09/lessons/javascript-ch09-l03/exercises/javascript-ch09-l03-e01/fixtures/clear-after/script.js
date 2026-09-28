const state = { items: ['星の本'] };
const list = document.querySelector('#books');
const count = document.querySelector('#count');
function render() {
  state.items.forEach((title) => {
    const item = document.createElement('li');
    item.textContent = title;
    list.appendChild(item);
  });
  list.replaceChildren();
  count.textContent = '冊数: ' + state.items.length;
}
render();
document.querySelector('#add').addEventListener('click', () => {
  state.items = [...state.items, '海の本'];
  render();
});
document.querySelector('#clear').addEventListener('click', () => {
  state.items = [];
  render();
});
