import { STATIC_COMPONENTS_MAIN } from './staticComponentsScaffold';

export const READING_MAIN = STATIC_COMPONENTS_MAIN;

export const READING_TYPES = `export interface Book {
  readonly id: string;
  readonly title: string;
  readonly read: boolean;
}

export interface BookCardProps {
  readonly book: Book;
  readonly onToggle: (id: string) => void;
}
`;

export const READING_DATA = `import type { Book } from './types';

export const initialBooks: readonly Book[] = [
  { id: 'stars', title: '星の地図', read: false },
  { id: 'rain', title: '雨の日の本', read: true },
  { id: 'forest', title: '森の記録', read: false },
];
`;

export const READING_CARD_MAIN = `import { useState } from 'react';
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
`;

export const READING_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>読書リスト</title>
    <style>
      body { margin: 0; padding: 24px; font-family: sans-serif; line-height: 1.7; }
      ul { padding-left: 24px; }
      li { margin-block: 16px; }
      h1 { font-size: 1.5rem; }
      h2 { font-size: 1.125rem; }
      button { padding: 8px 12px; margin: 4px; font: inherit; }
      button:focus-visible { outline: 3px solid #165dcc; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

/** 起動・初期データ・readonly型だけを固定し、表示部品と親の設計は編集できる。 */
export function isReadingScaffold(
  files: Readonly<Record<string, string>>,
  profile: string,
): boolean {
  const card = profile === 'reading-card-v1';
  return (
    files['main.tsx']?.trim() === (card ? READING_CARD_MAIN : READING_MAIN).trim() &&
    files['types.ts']?.trim() === READING_TYPES.trim() &&
    files['data.ts']?.trim() === READING_DATA.trim() &&
    Object.keys(files).sort().join(',') ===
      (card
        ? 'BookCard.tsx,data.ts,main.tsx,types.ts'
        : 'BookCard.tsx,components.tsx,data.ts,main.tsx,types.ts')
  );
}

/** 未知profileや足場の差し替えを拒否し、有限の既存React実行環境へ接続する。 */
export function isReadingWorkspace(
  files: Readonly<Record<string, string>>,
  profile: string,
): boolean {
  if (!['reading-card-v1', 'reading-state-v1', 'reading-filter-v1'].includes(profile)) return false;
  const { 'index.html': html, ...typescript } = files;
  return html?.trim() === READING_HTML.trim() && isReadingScaffold(typescript, profile);
}
