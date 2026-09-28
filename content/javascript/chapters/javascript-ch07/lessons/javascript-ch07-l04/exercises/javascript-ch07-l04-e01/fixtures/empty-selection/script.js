const books = document.querySelectorAll('.unknown');
books.forEach((book) => {
  book.classList.remove('pending');
  book.classList.add('done');
});
