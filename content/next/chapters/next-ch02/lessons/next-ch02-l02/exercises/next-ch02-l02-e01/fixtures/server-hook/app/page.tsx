import { basename } from 'node:path';
import Counter from './Counter';

/** Node側で文字列を用意し、値だけをClient Componentへ渡す。 */
export default async function Page() {
  const fileName = basename('/lesson/server-note.txt');
  const note = await Promise.resolve(fileName);
  return (
    <main>
      <h1 id="message">ServerとClientの役割</h1>
      <p id="server-note">{note}</p>
      <Counter initial={2} label="数を増やす" />
    </main>
  );
}
