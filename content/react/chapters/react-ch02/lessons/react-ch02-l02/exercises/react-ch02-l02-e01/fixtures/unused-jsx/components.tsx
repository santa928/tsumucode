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

  const unusedCards = books.map((book) => <BookCard key={book.id} book={book} onToggle={toggle} />);

  return (
    <section>
      <h1>読書リスト</h1>
      <ul id="books">
        {books.map((book) => (
          <li key={book.id}>
            <h2>{book.title}</h2>
            <p>{book.read ? '既読' : '未読'}</p>
            <button
              id={'toggle-' + book.id}
              type="button"
              aria-pressed={book.read}
              onClick={() => toggle(book.id)}
            >
              {book.read ? '未読にする' : '読了にする'}
            </button>
          </li>
        ))}
      </ul>
      <button id="reset" type="button" onClick={() => setBooks(initialBooks)}>
        最初に戻す
      </button>
    </section>
  );
}
