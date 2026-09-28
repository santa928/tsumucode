const books = document.querySelectorAll('.pending');
books.forEach((book) => {
  book.classList.remove('pending');
  book.classList.add('done');
});
