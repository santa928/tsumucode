const items = document.querySelectorAll('#books .book');
items.forEach((item) => {
  item.classList.remove('pending');
  item.classList.add('done');
});
