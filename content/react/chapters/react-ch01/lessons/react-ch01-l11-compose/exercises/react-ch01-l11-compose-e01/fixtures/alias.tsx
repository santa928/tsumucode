import { useEffect as sync, useState as state } from 'react';
import { subscribe } from './source';
import type { SourcePanelProps } from './types';
export function SourcePanel({ target }: SourcePanelProps) {
  const [value, setValue] = state('');
  sync(() => {
    const stop = subscribe(target, setValue);
    return stop;
  }, [target]);
  return (
    <section>
      <p id="observed">{value}</p>
      <p id="length">{value.length}</p>
    </section>
  );
}
