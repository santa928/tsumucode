import { useState } from 'react';
import type { FormState, InputChangeEvent, FormSubmitEvent } from './types';
export function App() {
  // TODO: 1つのState、表示の計算、入力・送信・やり直しの処理を書き、下の枠へつなぎます。
  return (
    <section>
      <h1>名前のForm</h1>
      <form id="name-form">
        <label htmlFor="name">名前</label>
        <input id="name" aria-describedby="message" aria-invalid={false} />
        <p id="length">0</p>
        <p id="message" role="status">
          入力中
        </p>
        <button id="submit" type="submit">
          送信
        </button>
        <button id="reset" type="button">
          やり直し
        </button>
      </form>
    </section>
  );
}
