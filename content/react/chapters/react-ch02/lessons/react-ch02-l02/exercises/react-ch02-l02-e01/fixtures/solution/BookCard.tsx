import type { BookCardProps } from './types';

export function BookCard({ book, onToggle }: BookCardProps) {
  return (
    <li>
      <h2>{book.title}</h2>
      <p>{book.read ? '既読' : '未読'}</p>
      <button
        id={'toggle-' + book.id}
        type="button"
        aria-pressed={book.read}
        onClick={() => onToggle(book.id)}
      >
        {book.read ? '未読にする' : '読了にする'}
      </button>
    </li>
  );
}
