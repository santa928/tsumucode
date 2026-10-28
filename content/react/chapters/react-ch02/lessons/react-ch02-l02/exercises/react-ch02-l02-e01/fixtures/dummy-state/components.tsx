import { useState } from 'react';
import { initialBooks } from './data';
import { BookCard } from './BookCard';

let books = initialBooks.map((book) => ({ ...book }));

export function App() {
  const [, render] = useState(0);
  function toggle(id: string) {
    books = books.map((book) => (book.id === id ? { ...book, read: !book.read } : book));
    render((value) => value + 1);
  }
  function reset() {
    books = initialBooks.map((book) => ({ ...book }));
    render((value) => value + 1);
  }
  return (
    <section>
      <h1>読書リスト</h1>
      <ul id="books">
        {books.map((book) => (
          <BookCard key={book.id} book={book} onToggle={toggle} />
        ))}
      </ul>
      <button id="reset" type="button" onClick={reset}>
        最初に戻す
      </button>
    </section>
  );
}
