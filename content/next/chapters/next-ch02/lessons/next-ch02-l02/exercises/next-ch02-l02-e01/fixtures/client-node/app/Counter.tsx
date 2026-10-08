'use client';

import { useState } from 'react';
import { existsSync } from 'node:fs';

/** ブラウザの状態とイベントは小さいClient側へ置く。 */
export default function Counter({ initial, label }: { initial: number; label: string }) {
  const [count, setCount] = useState(initial);
  return (
    <section aria-label="カウンター">
      <p>{String(existsSync('/lesson/client-note.txt'))}</p>
      <p>
        回数:{' '}
        <output id="count" aria-live="polite">
          {count}
        </output>
      </p>
      <button type="button" onClick={() => setCount(count + 1)}>
        {label}
      </button>
    </section>
  );
}
