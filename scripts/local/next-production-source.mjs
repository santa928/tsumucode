// 制作2教材の固定データとStarter。作者のSolutionは実行imageへ含めない。
export const NEXT_PROJECT_RULE_GOALS = Object.freeze([
  'project-structure',
  'project-filter',
  'project-presentation',
]);

export const PROJECT_BANNER = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
  <rect width="320" height="160" fill="#fffaf0"/>
  <path d="M0 130L90 40L160 100L220 55L320 130V160H0Z" fill="#267153"/>
  <circle cx="260" cy="32" r="16" fill="#f4bd46"/>
</svg>
`;

/** 同じ実行契約を使い、旅行と残席の別Briefに対応する固定Sourceを作る。 */
function starter(capstone) {
  const title = capstone ? '読書会の案内' : '小さな旅の案内';
  const section = capstone ? 'events' : 'trips';
  const key = capstone ? 'availability' : 'area';
  const first = capstone ? 'morning' : 'forest';
  const second = capstone ? 'evening' : 'sea';
  const items = capstone
    ? [
        {
          id: first,
          title: '朝の読書会',
          area: 'indoor',
          seats: 3,
          description: '朝の時間に本を読みます。',
        },
        {
          id: second,
          title: '夕方の読書会',
          area: 'indoor',
          seats: 0,
          description: 'この回は受付を終了しました。',
        },
      ]
    : [
        {
          id: first,
          title: '森の散歩',
          area: 'outdoor',
          seats: 3,
          description: '木陰を歩く小さな旅です。',
        },
        {
          id: second,
          title: '海の資料館',
          area: 'indoor',
          seats: 0,
          description: '室内で海の歴史を学びます。',
        },
      ];
  const options = capstone
    ? `<option value="all">すべて</option>
          <option value="open">受付中</option>
          <option value="full">受付終了</option>`
    : `<option value="all">すべて</option>
          <option value="outdoor">屋外</option>
          <option value="indoor">室内</option>`;
  return Object.freeze({
    'app/globals.css': `* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font: 1rem/1.7 system-ui, sans-serif;
  color: #19352d;
  background: #fffaf0;
}
main, nav {
  max-width: 48rem;
  margin: auto;
  padding: 1.5rem;
}
a, button, select {
  min-height: 44px;
  display: inline-block;
  padding: .5rem;
  font: inherit;
}
a {
  color: #175344;
}
:focus-visible {
  outline: 3px solid #267153;
  outline-offset: 4px;
}
img {
  max-width: 100%;
  height: auto;
}
h1, p {
  overflow-wrap: anywhere;
}
`,
    'app/layout.tsx': `import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { projectBase } from './catalog';
import './globals.css';

export const metadata: Metadata = {
  title: '${title}',
  description: '一覧から詳細へ進む${title}です。',
};

/** 共通ナビゲーションと日本語の文書を用意する。 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const base = projectBase();
  return (
    <html lang="ja">
      <body>
        <nav aria-label="サイト内">
          <a href={base + '/'}>入口</a>
          <a href={base + '/${section}'}>一覧</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
`,
    'app/data.ts': `export type CatalogItem = {
  id: string;
  title: string;
  area: 'outdoor' | 'indoor';
  seats: number;
  description: string;
};

export const catalog: readonly CatalogItem[] = ${JSON.stringify(items, null, 2)};
`,
    'app/catalog.ts': `import type { CatalogItem } from './data';

/** Localの同じrunと、持ち出したrootの経路を対応させる。 */
export function projectBase(): string {
  return process.env.TSUMUCODE_NEXT_BASE_PATH ?? '';
}

/** 同じサーバーの固定Route Handlerを実HTTPで取得し、通信失敗を隠さない。 */
export async function loadCatalog(): Promise<readonly CatalogItem[]> {
  const port = process.env.PORT ?? '5174';
  const reply = await fetch('http://127.0.0.1:' + port + projectBase() + '/api/catalog', {
    cache: 'no-store',
    signal: AbortSignal.timeout(1500),
  });
  if (!reply.ok) throw new Error('一覧データを取得できません。');
  return (await reply.json()) as CatalogItem[];
}
`,
    'app/api/catalog/route.ts': `import { catalog } from '../../data';

/** 編集対象のpageから同じ隔離内で読む固定JSON。DBや外部APIは使わない。 */
export function GET(): Response {
  return Response.json(catalog);
}
`,
    'public/banner.svg': PROJECT_BANNER,
    'app/page.tsx': `import type { Metadata } from 'next';
import Image from 'next/image';
import { projectBase } from './catalog';

export const metadata: Metadata = {
  title: '制作途中',
  description: '制作途中',
};

export default function Page() {
  const base = projectBase();
  return (
    <main>
      <h1 id="message">${title}</h1>
      <p>一覧から気になる項目の詳細を確かめます。</p>
      <Image src={base + '/banner.svg'} width={320} height={160} alt="画像" unoptimized />
      <p>
        <a href={base + '/${section}'}>一覧を開く</a>
      </p>
    </main>
  );
}
`,
    [`app/${section}/page.tsx`]: `import { loadCatalog, projectBase } from '../catalog';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<{ ${key}?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  const query = await searchParams;
  const selected = typeof query.${key} === 'string' ? query.${key} : 'all';
  const items = await loadCatalog();
  const shown = items;
  const base = projectBase();
  return (
    <main>
      <h1 id="message">${capstone ? '読書会一覧' : '旅の一覧'}</h1>
      <form method="get" action={base + '/${section}'}>
        <label htmlFor="filter">${capstone ? '受付状況' : '過ごす場所'}</label>
        <select id="filter" name="${key}" defaultValue={selected}>
          ${options}
        </select>
        <button type="submit">絞り込む</button>
      </form>
      <ul>
        {shown.map((item) => (
          <li key={item.id}>
            <a href={base + '/${section}/' + item.id}>{item.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
`,
    [`app/${section}/[id]/page.tsx`]: `import { notFound } from 'next/navigation';
import { loadCatalog, projectBase } from '../../catalog';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  const items = await loadCatalog();
  const item = items[0];
  if (!item) notFound();
  return (
    <main>
      <h1 id="message">{item.title}</h1>
      <p>{item.description}</p>
      ${capstone ? '<p id="booking-state">受付中</p>' : "<p id=\"area\">{item.area === 'outdoor' ? '屋外' : '室内'}</p>"}
      <a href={projectBase() + '/${section}'}>一覧へ戻る</a>
    </main>
  );
}
`,
  });
}

export const GUIDED_PROJECT_STARTER_FILES = starter(false);
export const CAPSTONE_PROJECT_STARTER_FILES = starter(true);
