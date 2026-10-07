import { useRef, useState } from 'react';
import type { InputChangeEvent } from './types';
export function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  function change(event: InputChangeEvent) {
    setName(event.currentTarget.value);
  }
  function focusInput() {
    inputRef.current?.focus();
  }
  return (
    <section>
      <h1>Refで入力へ移る</h1>
      <label htmlFor="name">名前</label>
      <input id="name" ref={inputRef} value={name} onChange={change} />
      <button id="focus" type="button" onClick={focusInput}>
        入力へ移る
      </button>
      <p id="name-summary">{name}</p>
      <p id="length">{name.length}</p>
    </section>
  );
}
