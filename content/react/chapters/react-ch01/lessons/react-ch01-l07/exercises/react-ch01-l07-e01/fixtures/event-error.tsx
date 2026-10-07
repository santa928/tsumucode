import { useState } from 'react';
import type { NameFieldProps, NameSummaryProps, InputChangeEvent } from './types';
function NameField({ value, onNameChange }: NameFieldProps) {
  function change(event: InputChangeEvent) {
    onNameChange(event.currentTarget.value);
    throw new Error('共有入力の元例外');
  }
  return (
    <div>
      <label htmlFor="name">名前</label>
      <input id="name" value={value} onChange={change} />
    </div>
  );
}
function NameSummary(props: NameSummaryProps) {
  return (
    <section>
      <p id="name-summary">{props.value}</p>
      <p id="length">{props.value.length}</p>
    </section>
  );
}
export function App() {
  const [name, setName] = useState('');
  return (
    <section>
      <h1>共有する名前</h1>
      <NameField value={name} onNameChange={setName} />
      <NameSummary value={name} />
      <button id="reset" type="button" onClick={() => setName('')}>
        やり直し
      </button>
    </section>
  );
}
