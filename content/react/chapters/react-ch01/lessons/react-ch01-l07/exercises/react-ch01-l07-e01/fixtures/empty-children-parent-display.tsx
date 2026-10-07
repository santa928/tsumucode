import { useState } from 'react';
import type { NameFieldProps, NameSummaryProps, InputChangeEvent } from './types';
function NameField({ value }: NameFieldProps) {
  return <div aria-label={value}></div>;
}
function NameSummary(props: NameSummaryProps) {
  return <section aria-label={props.value}></section>;
}
export function App() {
  const [name, setName] = useState('');
  return (
    <section>
      <h1>共有する名前</h1>
      <NameField value={name} onNameChange={setName} />
      <NameSummary value={name} />
      <label htmlFor="name">名前</label>
      <input
        id="name"
        value={name}
        onChange={(event: InputChangeEvent) => setName(event.currentTarget.value)}
      />
      <p id="name-summary">{name}</p>
      <p id="length">{name.length}</p>
      <button id="reset" type="button" onClick={() => setName('')}>
        やり直し
      </button>
    </section>
  );
}
