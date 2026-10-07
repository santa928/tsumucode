import { useSourceValue } from './sourceHook';
import type { SourcePanelProps } from './types';
export function SourcePanel({ target }: SourcePanelProps) {
  const value = useSourceValue(target);
  const isA = target === 'source-a';
  return (
    <section>
      <h2>{isA ? '入力Aの表示' : '入力Bの表示'}</h2>
      <p id={isA ? 'observed-a' : 'observed-b'} role="status">
        {value}
      </p>
      <p id={isA ? 'length-a' : 'length-b'}>{value.length}</p>
    </section>
  );
}
