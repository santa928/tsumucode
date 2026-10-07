import { useContext as readContext } from 'react';
import { NameContext as SharedName } from './nameContext';
import type { InputChangeEvent } from './types';

export function NameField() {
  const provided = readContext(SharedName);
  if (provided === null) return <p>Providerが必要です</p>;
  const change = (event: InputChangeEvent) => {
    provided.onNameChange(event.currentTarget.value);
  };
  return (
    <div>
      <label htmlFor="name">名前</label>
      <input id="name" value={provided.value} onChange={change} />
    </div>
  );
}

export function NameSummary() {
  const provided = readContext(SharedName);
  if (provided === null) return <p>Providerが必要です</p>;
  return (
    <section>
      <p id="name-summary">{provided.value}</p>
      <p id="length">{provided.value.length}</p>
    </section>
  );
}
