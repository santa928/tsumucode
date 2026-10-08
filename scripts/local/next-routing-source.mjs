// 固定教材の初期Source。表示と保存・実行で同じ内容を使う。
export const ROUTING_STARTER_FILES = Object.freeze({
  'app/globals.css': `body {
  font-family: sans-serif;
  margin: 2rem;
}

a,
button {
  display: inline-block;
  margin: 0.5rem;
  padding: 0.75rem;
}
`,
  'app/layout.tsx': `import type { ReactNode } from 'react';
import './globals.css';

/** 全pageを日本語のHTMLで囲む。 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
`,
  'app/page.tsx': `/** 旅行一覧へ文書単位で移動する入口。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">旅行の入口</h1>
      <a href="./trips">旅行一覧へ</a>
    </main>
  );
}
`,
  'app/trips/[slug]/page.tsx': `/** 動的なURLの値はPromiseで届く。awaitして表示へ渡す。 */
export default async function TripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main>
      <h1 id="message">旅の詳細</h1>
      <p id="trip-slug">未設定</p>
      <p>URLから届いた値: {slug}</p>
      <a href="../trips">旅行一覧へ</a>
    </main>
  );
}
`,
  'app/trips/layout.tsx': `import type { ReactNode } from 'react';

/** trips配下のpageを共通の見出しで囲む。 */
export default function TripsLayout({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="trip-layout">
      <h2 id="trip-layout">旅行エリア</h2>
      {children}
    </section>
  );
}
`,
  'app/trips/page.tsx': `/** 一覧のURLから2つの詳細URLへ文書を読み直して移動する。 */
export default function TripsPage() {
  return (
    <main>
      <h1 id="message">旅行一覧</h1>
      <a href="./trips/forest">森の旅へ</a>
      <a href="./trips/forest">海の旅へ</a>
    </main>
  );
}
`,
});
export const BOUNDARY_STARTER_FILES = Object.freeze({
  'app/Counter.tsx': `import { useState } from 'react';

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
      <button type="button" onClick={() => setCount(count)}>
        {label}
      </button>
    </section>
  );
}
`,
  'app/globals.css': `body {
  font-family: sans-serif;
  margin: 2rem;
}

a,
button {
  display: inline-block;
  margin: 0.5rem;
  padding: 0.75rem;
}
`,
  'app/layout.tsx': `import type { ReactNode } from 'react';
import './globals.css';

/** 全pageを日本語のHTMLで囲む。 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
`,
  'app/page.tsx': `import { basename } from 'node:path';
import Counter from './Counter';

/** Node側で文字列を用意し、値だけをClient Componentへ渡す。 */
export default async function Page() {
  const fileName = basename('/lesson/server-note.txt');
  const note = await Promise.resolve(fileName);
  return (
    <main>
      <h1 id="message">ServerとClientの役割</h1>
      <p id="server-note">{note}</p>
      <Counter initial={0} label="数を増やす" />
    </main>
  );
}
`,
});
