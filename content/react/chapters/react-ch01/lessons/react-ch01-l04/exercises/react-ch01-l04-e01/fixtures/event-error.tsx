import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  function increment() {
    setCount((current) => current + 1);
    throw new Error('操作の確認用エラー');
  }

  function twice() {
    setCount((current) => current + 1);
    setCount((current) => current + 1);
  }

  return (
    <section>
      <h1>カウンター</h1>
      <p id="count">{count}</p>
      <button id="increment" onClick={increment}>
        1増やす
      </button>
      <button id="twice" onClick={twice}>
        2増やす
      </button>
    </section>
  );
}
