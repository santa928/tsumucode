import type { BookCardProps } from './types';

function BookTitle({ title }: { readonly title: string }) {
  return <h2>{title}</h2>;
}

export const BookCard = (props: BookCardProps) => {
  function notifyParent() {
    props.onToggle(props.book.id);
  }

  return (
    <li>
      <BookTitle title={props.book.title} />
      <p>{props.book.read ? '既読' : '未読'}</p>
      <button
        id={'toggle-' + props.book.id}
        type="button"
        aria-pressed={props.book.read}
        onClick={notifyParent}
      >
        {props.book.read ? '未読にする' : '読了にする'}
      </button>
    </li>
  );
};
