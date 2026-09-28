const books = document.querySelectorAll('#books .book');
for (const book of books) {
  book.classList.add('done');
  book.classList.remove('pending');
}
