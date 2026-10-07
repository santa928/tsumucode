import { useRef as makeRef, useState } from 'react';
import type { InputChangeEvent } from './types';
export function App() {
  const nameRef = makeRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  function change(event: InputChangeEvent) {
    setName(event.currentTarget.value);
  }
  function focusInput() {
    nameRef.current?.focus();
  }
  return (
    <section>
      <h1>Refで入力へ移る</h1>
      <label htmlFor="name">名前</label>
      <input id="name" ref={nameRef} value={name} onChange={change} />
      <button id="focus" type="button" onClick={focusInput}>
        入力へ移る
      </button>
      <p id="name-summary">{name}</p>
      <p id="length">{name.length}</p>
    </section>
  );
}
