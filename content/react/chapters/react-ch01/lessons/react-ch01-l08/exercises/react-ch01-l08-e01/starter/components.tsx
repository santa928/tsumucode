import { useReducer } from 'react';
import type { InputChangeEvent, FormSubmitEvent } from './types';
import { reduceForm } from './reducer';
export function App() {
  const [form, dispatch] = useReducer(reduceForm, { name: '', attempted: false });
  const missing = form.name.trim().length === 0;
  const message = form.attempted
    ? missing
      ? '名前を入力してください'
      : '送信を受け付けました'
    : '入力中';
  function change(event: InputChangeEvent) {
    const next = event.currentTarget.value;
    dispatch({ type: 'nameChanged', nextName: next });
  }
  function submit(event: FormSubmitEvent) {
    event.preventDefault();
    dispatch({ type: 'submitted' });
  }
  return (
    <section>
      <h1>名前のForm</h1>
      <form id="name-form" onSubmit={submit}>
        <label htmlFor="name">名前</label>
        <input
          id="name"
          value={form.name}
          onChange={change}
          aria-describedby="message"
          aria-invalid={form.attempted && missing}
        />
        <p id="length">{form.name.length}</p>
        <p id="message" role="status">
          {message}
        </p>
        <button id="submit" type="submit">
          送信
        </button>
        <button id="reset" type="button" onClick={() => dispatch({ type: 'reset' })}>
          やり直し
        </button>
      </form>
    </section>
  );
}
