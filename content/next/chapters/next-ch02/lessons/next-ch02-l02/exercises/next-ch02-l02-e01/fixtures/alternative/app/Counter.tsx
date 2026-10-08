'use client';

import { useState } from 'react';

/** ブラウザの状態とイベントは小さいClient側へ置く。 */
export default function Counter({ initial, label }: { initial: number; label: string }) {
  const [count, setCount] = useState(initial);
  return (
    <section aria-label="カウンター">
      <p>
        回数:{' '}
        <output id="count" aria-live="polite">
          {count}
        </output>
      </p>
      <button type="button" onClick={() => setCount((previous) => previous + 1)}>
        {label}
      </button>
    </section>
  );
}
