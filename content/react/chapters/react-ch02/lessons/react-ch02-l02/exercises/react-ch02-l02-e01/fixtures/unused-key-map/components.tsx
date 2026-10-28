import { useState } from 'react';
import { initialBooks } from './data';
import { BookCard } from './BookCard';
import type { Book } from './types';

export function App() {
  const [books, setBooks] = useState<readonly Book[]>(initialBooks);

  function toggle(id: string) {
    setBooks((current) =>
      current.map((book) => (book.id === id ? { ...book, read: !book.read } : book)),
    );
  }

  const [first, second, third] = books;
  const unusedCards = books.map((book) => <BookCard key={book.id} book={book} onToggle={toggle} />);

  return (
    <section>
      <h1>読書リスト</h1>
      <ul id="books">
        <BookCard book={first!} onToggle={toggle} />
        <BookCard book={second!} onToggle={toggle} />
        <BookCard book={third!} onToggle={toggle} />
      </ul>
      <button id="reset" type="button" onClick={() => setBooks(initialBooks)}>
        最初に戻す
      </button>
    </section>
  );
}
