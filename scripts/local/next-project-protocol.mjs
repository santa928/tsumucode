// 固定Next教材だけを扱う。APIからprofileや設定を自由に選ばせない。
import { ROUTING_STARTER_FILES, BOUNDARY_STARTER_FILES } from './next-routing-source.mjs';
export const NEXT_PROFILE = 'next-project-v1';
export const NEXT_WORKSPACE = 'next-ch01-l01-e01';
export const NEXT_STARTER_FILES = Object.freeze({
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
  'app/page.tsx': `/** pageの見出しを返す。APIのJSONとは別の応答。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">こんにちは、Starter！</h1>
      <p>見出しと、queryが異なる2つのHTTP応答を確かめます。</p>
    </main>
  );
}
`,
  'app/globals.css': `body {
  font-family: sans-serif;
  margin: 2rem;
}
`,
  'app/api/question/route.ts': `/** queryを受け取りJSONを返す。外部APIや秘密情報は使わない。 */
export function GET(request: Request): Response {
  const second = new URL(request.url).searchParams.get('mode') === 'second';
  return Response.json({
    message: second ? '最初の実リクエスト' : '最初の実リクエスト',
  });
}
`,
});

export const NEXT_WORKSPACES = Object.freeze({
  [NEXT_WORKSPACE]: {
    files: NEXT_STARTER_FILES,
    goal: 'page-route-query',
    pages: ['', 'api/question', 'api/question?mode=second'],
    previewLabels: ['pageの表示', 'JSON応答: queryなし', 'JSON応答: mode=second'],
  },
  'next-ch02-l01-e01': {
    files: ROUTING_STARTER_FILES,
    goal: 'nested-dynamic-navigation',
    pages: ['', 'trips', 'trips/forest', 'trips/sea'],
    previewLabels: ['入口の表示', '旅行一覧', '森の詳細', '海の詳細'],
  },
  'next-ch02-l02-e01': {
    files: BOUNDARY_STARTER_FILES,
    goal: 'server-client-counter',
    pages: [''],
    previewLabels: ['ServerとClientの表示'],
  },
});

/** 未知WorkspaceはNextの固定契約へ入れない。 */
export function nextWorkspace(id) {
  return Object.hasOwn(NEXT_WORKSPACES, id) ? NEXT_WORKSPACES[id] : undefined;
}

export function workspaceProfile(id) {
  return nextWorkspace(id) ? NEXT_PROFILE : 'vite-project-v1';
}
