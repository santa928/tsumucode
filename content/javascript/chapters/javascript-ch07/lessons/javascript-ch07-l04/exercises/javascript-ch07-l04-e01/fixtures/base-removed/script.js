const books = document.querySelectorAll('#books .book');
books.forEach((book) => {
  book.classList.remove('book');
  book.classList.add('done');
});
