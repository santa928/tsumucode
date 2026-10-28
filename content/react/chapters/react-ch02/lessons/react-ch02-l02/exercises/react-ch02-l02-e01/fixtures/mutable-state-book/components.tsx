import { useState } from 'react';
import { initialBooks } from './data';
import { BookCard } from './BookCard';
import type { Book } from './types';

export function App() {
  const [books, setBooks] = useState(initialBooks.map((book) => ({ ...book })));

  function toggle(id: string) {
    setBooks((current) =>
      current.map((book) => {
        if (book.id === id) book.read = !book.read;
        return book;
      }),
    );
  }

  return (
    <section>
      <h1>読書リスト</h1>
      <ul id="books">
        {books.map((book) => (
          <BookCard key={book.id} book={book} onToggle={toggle} />
        ))}
      </ul>
      <button
        id="reset"
        type="button"
        onClick={() => setBooks(initialBooks.map((book) => ({ ...book })))}
      >
        最初に戻す
      </button>
    </section>
  );
}
