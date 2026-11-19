import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookCard } from './BookCard';
import { initialBooks } from './data';
import type { Book } from './types';

function App() {
  const [books, setBooks] = useState<readonly Book[]>(initialBooks);

  function toggle(id: string) {
    setBooks((current) =>
      current.map((book) => (book.id === id ? { ...book, read: !book.read } : book)),
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
      <button id="reset" type="button" onClick={() => setBooks(initialBooks)}>
        最初に戻す
      </button>
    </section>
  );
}

const container = document.getElementById('root');
if (container === null) throw new Error('表示先がありません');
createRoot(container).render(<App />);
