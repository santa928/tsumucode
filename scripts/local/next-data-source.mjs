// 固定制御データと教材Source。実行・表示・保存で同じ初期値を使う。
export const DATA_STARTER_FILES = Object.freeze({
  'app/api/sample/route.ts': `type Mode = 'fresh' | 'cached' | 'revalidate';
type Entry = { readId: number; label: string };
let sequence = 0;
const counts: Partial<Record<Mode, number>> = {};
const last: Partial<Record<Mode, Entry>> = {};
const history: Partial<Record<Mode, Entry[]>> = {};

/** 取得ごとに値を変える固定データ。controlはtrusted採点器からだけ観測する。 */
export function GET(request: Request): Response {
  const parameters = new URL(request.url).searchParams;
  if (parameters.get('control') === 'inspect')
    return Response.json({ sequence, counts, last, history });
  const mode = parameters.get('mode') as Mode;
  if (!['fresh', 'cached', 'revalidate'].includes(mode)) {
    return Response.json({ error: '対象なし' }, { status: 404 });
  }
  sequence += 1;
  const entry = { readId: sequence, label: sequence % 2 === 1 ? '朝の森' : '午後の森' };
  counts[mode] = (counts[mode] ?? 0) + 1;
  last[mode] = entry;
  const recent = history[mode] ?? [];
  recent.push(entry);
  if (recent.length > 16) recent.shift();
  history[mode] = recent;
  return Response.json(entry);
}
`,
  'app/data/[mode]/page.tsx': `import { connection } from 'next/server';
import { dataUrl } from '../../data-url';

/** pageの再描画とデータの再取得を分けて観察する。 */
export default async function DataPage({ params }: { params: Promise<{ mode: string }> }) {
  await connection();
  const { mode } = await params;
  const options =
    mode === 'fresh'
      ? { cache: 'force-cache' as const }
      : mode === 'cached'
        ? { cache: 'no-store' as const }
        : { next: { revalidate: 30 } };
  const response = await fetch(dataUrl('sample', mode), options);
  if (!response.ok) throw new Error('教材データの読み込み失敗');
  const data = await response.json();
  return (
    <main>
      <h1 id="message">取得と保持: {mode}</h1>
      <p>
        取得番号: <output id="read-id">{data.readId}</output>
      </p>
      <p id="data-label">{data.label}</p>
    </main>
  );
}
`,
  'app/data-url.ts': `/** 同じ隔離内の制御データだけを指す。秘密情報や外部APIは使わない。 */
export function dataUrl(kind: 'sample' | 'weather', mode: string): string {
  const base = process.env.TSUMUCODE_NEXT_BASE_PATH ?? '';
  const query = kind === 'sample' ? 'mode' : 'state';
  return \`http://127.0.0.1:5174\${base}/api/\${kind}?\${query}=\${mode}\`;
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
  'app/page.tsx': `/** 保持条件の異なる3つのServer pageへ移動する。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">取得と保持を比べる</h1>
      <a href="./data/fresh">毎回取得</a>
      <a href="./data/cached">保持した値</a>
      <a href="./data/revalidate">期限後の更新</a>
    </main>
  );
}
`,
});
export const WEATHER_STARTER_FILES = Object.freeze({
  'app/api/weather/route.ts': `type State = 'clear' | 'slow' | 'flaky' | 'missing';
let attempts = 0;
const history: Array<{ state: State; status: number }> = [];

/** 固定の遅延・初回失敗・対象なし。controlはBrowser Previewで公開しない。 */
export async function GET(request: Request): Promise<Response> {
  const parameters = new URL(request.url).searchParams;
  const control = parameters.get('control');
  if (control === 'reset') {
    attempts = 0;
    history.length = 0;
    return Response.json({ reset: true });
  }
  if (control === 'inspect') return Response.json({ history });
  const state = parameters.get('state') as State;
  if (!['clear', 'slow', 'flaky', 'missing'].includes(state)) {
    return Response.json({ error: '対象なし' }, { status: 404 });
  }
  if (state === 'slow') await new Promise((resolve) => setTimeout(resolve, 1500));
  const status = state === 'missing' ? 404 : state === 'flaky' && ++attempts === 1 ? 503 : 200;
  history.push({ state, status });
  if (history.length > 32) history.shift();
  if (status !== 200) return Response.json({ error: '教材データの読み込み失敗' }, { status });
  return Response.json({
    label: state === 'slow' ? '遅延後の晴れ' : state === 'flaky' ? '再試行後の晴れ' : '晴れ',
  });
}
`,
  'app/data-url.ts': `/** 同じ隔離内の制御データだけを指す。秘密情報や外部APIは使わない。 */
export function dataUrl(kind: 'sample' | 'weather', mode: string): string {
  const base = process.env.TSUMUCODE_NEXT_BASE_PATH ?? '';
  const query = kind === 'sample' ? 'mode' : 'state';
  return \`http://127.0.0.1:5174\${base}/api/\${kind}?\${query}=\${mode}\`;
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
  'app/page.tsx': `import Link from 'next/link';

/** prefetchを使わず、移動後の待機・結果・再試行を観察する。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">待機・失敗・対象なし</h1>
      <Link prefetch={false} href="/weather/clear">
        正常な応答
      </Link>
      <Link prefetch={false} href="/weather/slow">
        遅い応答
      </Link>
      <Link prefetch={false} href="/weather/flaky">
        一度失敗
      </Link>
      <Link prefetch={false} href="/weather/missing">
        対象なし
      </Link>
    </main>
  );
}
`,
  'app/weather/[state]/error.tsx': `'use client';

/** 表示の再描画と、データの再取得を区別する。 */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1 id="message">読み込み失敗</h1>
      <p>データを取得できませんでした。もう一度試してください。</p>
      <button type="button" onClick={reset}>
        再試行
      </button>
    </main>
  );
}
`,
  'app/weather/[state]/loading.tsx': `/** 待機中の案内を結果と区別する。 */
export default function Loading() {
  return <p role="status">準備中</p>;
}
`,
  'app/weather/[state]/not-found.tsx': `/** 対象なしを、取得失敗の再試行案内と分ける。 */
export default function Missing() {
  return (
    <main>
      <h1 id="message">対象が見つかりません</h1>
      <p>この記録はありません。</p>
    </main>
  );
}
`,
  'app/weather/[state]/page.tsx': `import { connection } from 'next/server';
import { dataUrl } from '../../data-url';

/** 制御データの状態を、待機・失敗・対象なしの画面へ対応させる。 */
export default async function WeatherPage({ params }: { params: Promise<{ state: string }> }) {
  await connection();
  const { state } = await params;
  const response = await fetch(dataUrl('weather', state), { cache: 'no-store' });
  if (!response.ok) throw new Error('教材データの読み込み失敗');
  const data = await response.json();
  return (
    <main>
      <h1 id="message">天気の記録</h1>
      <p id="weather">{data.label}</p>
    </main>
  );
}
`,
});
