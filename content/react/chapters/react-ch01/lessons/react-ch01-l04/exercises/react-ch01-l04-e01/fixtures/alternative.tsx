import { useState as remember } from 'react';

export function App() {
  const [value, setValue] = remember(0);

  function increment() {
    setValue(value + 1);
  }

  function twice() {
    setValue((current) => current + 1);
    setValue((current) => current + 1);
  }

  return (
    <section>
      <h1>カウンター</h1>
      <p id="count">{value}</p>
      <button id="increment" onClick={increment}>
        1増やす
      </button>
      <button id="twice" onClick={twice}>
        2増やす
      </button>
    </section>
  );
}
