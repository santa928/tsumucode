'use client';

import { useActionState, useState } from 'react';
import { saveNote } from './actions';
import { initialState } from './note-state';

export default function NoteForm() {
  const [input, setInput] = useState('');
  const [state, formAction, pending] = useActionState(saveNote, initialState);
  const visible = state;
  return (
    <form action={formAction}>
      <label htmlFor="note">メモ</label>
      <input
        id="note"
        name="note"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        required
        minLength={3}
        maxLength={40}
        disabled={false}
        aria-describedby="note-result"
      />
      <button type="submit" disabled={pending}>
        {pending ? '送信中…' : '保存する'}
      </button>
      <p id="note-result" role="status" aria-live="polite" data-state={visible.status}>
        {pending ? '送信中です。' : visible.message}
      </p>
      {visible.status === 'saved' && <p id="saved-count">このメモの保存回数: {visible.count}</p>}
    </form>
  );
}
