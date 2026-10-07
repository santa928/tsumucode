import { useEffect, useState } from 'react';
import { subscribe } from './source';
import type { SourcePanelProps } from './types';
export function SourcePanel({ target }: SourcePanelProps) {
  const [value, setValue] = useState('');
  useEffect(() => {
    const stop = subscribe(target, setValue);
    return stop;
  }, []);
  return (
    <section>
      <p id="observed">{value}</p>
      <p id="length">{value.length}</p>
    </section>
  );
}
