const state = {
  items: [
    { title: '星の本', done: false },
    { title: '海の本', done: true },
    { title: '森の本', done: false },
  ],
  onlyUnread: false,
};
const list = document.querySelector('#books');
const count = document.querySelector('#count');
function render() {
  let visible = state.items;
  if (state.onlyUnread) {
    visible = state.items.filter((book) => book.done === false);
  }
  list.replaceChildren();
  visible.forEach((book) => {
    const item = document.createElement('li');
    item.textContent = book.title;
    list.appendChild(item);
  });
  count.textContent = '表示: ' + visible.length + ' / 全体: ' + state.items.length;
}
render();
document.querySelector('#unread').addEventListener('click', () => {
  state.onlyUnread = true;
  render();
});
document.querySelector('#all').addEventListener('click', () => {
  state.onlyUnread = false;
});
