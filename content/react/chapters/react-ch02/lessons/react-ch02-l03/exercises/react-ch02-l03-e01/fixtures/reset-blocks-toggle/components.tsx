import { useState } from 'react';
import { initialBooks } from './data';
import { BookCard } from './BookCard';
import type { Book } from './types';

export function App() {
  const [canToggle, setCanToggle] = useState(true);
  const [books, setBooks] = useState<readonly Book[]>(initialBooks);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const visible = books.filter(
    (book) => filter === 'all' || (filter === 'read' ? book.read : !book.read),
  );
  const readCount = books.filter((book) => book.read).length;

  function toggle(id: string) {
    if (!canToggle) return;
    setBooks((current) =>
      current.map((book) => (book.id === id ? { ...book, read: !book.read } : book)),
    );
  }

  function reset() {
    setBooks(initialBooks);
    setFilter('all');
    setCanToggle(false);
  }

  return (
    <section>
      <h1>読書リスト</h1>
      <div>
        <button
          id="filter-all"
          type="button"
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          すべて
        </button>
        <button
          id="filter-unread"
          type="button"
          aria-pressed={filter === 'unread'}
          onClick={() => setFilter('unread')}
        >
          未読
        </button>
        <button
          id="filter-read"
          type="button"
          aria-pressed={filter === 'read'}
          onClick={() => setFilter('read')}
        >
          既読
        </button>
      </div>
      <p id="count">{visible.length}件</p>
      <p id="summary">既読{readCount}件 / 全3件</p>
      <ul id="books">
        {visible.map((book) => (
          <BookCard key={book.id} book={book} onToggle={toggle} />
        ))}
      </ul>
      <button id="reset" type="button" onClick={reset}>
        最初に戻す
      </button>
    </section>
  );
}
