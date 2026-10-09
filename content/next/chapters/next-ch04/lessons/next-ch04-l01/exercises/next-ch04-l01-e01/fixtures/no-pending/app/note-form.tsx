'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { initialState } from './note-state';
import type { NoteState } from './note-state';

export default function NoteForm({ endpoint }: { endpoint: string }) {
  const [input, setInput] = useState('');
  const [state, setState] = useState<NoteState>(initialState);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    const submitted = input;
    try {
      const reply = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: submitted }),
      });
      setState((await reply.json()) as NoteState);
    } catch {
      setState({
        status: 'failed',
        message: '送信できませんでした。同じ内容で再試行してください。',
        count: 0,
        input: submitted,
      });
    } finally {
      setPending(false);
    }
  }
  const visible = state.input === input ? state : initialState;
  return (
    <form onSubmit={submit}>
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
