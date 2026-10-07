import { useState } from 'react';
import type { NameFieldProps, NameSummaryProps, InputChangeEvent } from './types';
function EditName({ value, onNameChange }: NameFieldProps) {
  function change(event: InputChangeEvent) {
    onNameChange(event.currentTarget.value);
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
  function update(next: string) {
    setName(next);
  }
  return (
    <section>
      <h1>共有する名前</h1>
      <EditName value={name} onNameChange={update} />
      <NameSummary value={name} />
      <button id="reset" type="button" onClick={() => setName('')}>
        やり直し
      </button>
    </section>
  );
}
