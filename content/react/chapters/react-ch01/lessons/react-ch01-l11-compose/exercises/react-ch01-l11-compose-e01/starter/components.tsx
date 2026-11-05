import { useEffect, useState } from 'react';
import { subscribe } from './source';
import type { SourcePanelProps } from './types';
export function SourcePanel({ target }: SourcePanelProps) {
  // TODO: 空文字列のStateと、選んだ入力へのEffectを書き、下の表示へつなぎます。
  return (
    <section>
      <p id="observed"></p>
      <p id="length">0</p>
    </section>
  );
}
