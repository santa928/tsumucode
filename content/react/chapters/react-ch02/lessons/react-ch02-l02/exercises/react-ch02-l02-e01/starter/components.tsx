import { useState } from 'react';
import { initialBooks } from './data';
import { BookCard } from './BookCard';
import type { Book } from './types';

export function App() {
  // 3冊の状態、切り替える処理、最初に戻す処理を作ります。
  return (
    <section>
      <h1>読書リスト</h1>
      <ul id="books">{/* 本を並べます。 */}</ul>
    </section>
  );
}
