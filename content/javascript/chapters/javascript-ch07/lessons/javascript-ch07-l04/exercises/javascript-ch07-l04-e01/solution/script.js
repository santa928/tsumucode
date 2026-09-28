const books = document.querySelectorAll('#books .book');
books.forEach((book) => {
  book.classList.remove('pending');
  book.classList.add('done');
});
