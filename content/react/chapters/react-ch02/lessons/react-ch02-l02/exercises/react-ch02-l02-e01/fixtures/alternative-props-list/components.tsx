function BookRows({
  books,
  onToggle,
}: {
  readonly books: readonly Book[];
  readonly onToggle: (id: string) => void;
}) {
  return (
    <ul id="books">
      {books.map((book) => (
        <BookCard key={book.id} book={book} onToggle={onToggle} />
      ))}
    </ul>
  );
}
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

  return (
    <section>
      <h1>読書リスト</h1>
      <BookRows books={books} onToggle={toggle} />
      <button id="reset" type="button" onClick={() => setBooks(initialBooks)}>
        最初に戻す
      </button>
    </section>
  );
}
