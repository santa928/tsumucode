// 固定Next教材だけを扱う。APIからprofileや設定を自由に選ばせない。
import { ROUTING_STARTER_FILES, BOUNDARY_STARTER_FILES } from './next-routing-source.mjs';
import { DATA_STARTER_FILES, WEATHER_STARTER_FILES } from './next-data-source.mjs';
import { FORM_STARTER_FILES, ACTION_STARTER_FILES } from './next-form-source.mjs';
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
  'next-ch04-l01-e01': {
    files: FORM_STARTER_FILES,
    goal: 'form-route-validation',
    pages: [''],
    previewLabels: ['FormとServer validation'],
    readonlyFiles: [
      'app/layout.tsx',
      'app/globals.css',
      'app/page.tsx',
      'app/note-state.ts',
      'app/note-store.ts',
    ],
  },
  'next-ch04-l02-e01': {
    files: ACTION_STARTER_FILES,
    goal: 'server-action-validation',
    pages: [''],
    previewLabels: ['Server Actionの再試行'],
    readonlyFiles: [
      'app/layout.tsx',
      'app/globals.css',
      'app/page.tsx',
      'app/note-state.ts',
      'app/note-store.ts',
    ],
  },
  'next-ch03-l01-e01': {
    files: DATA_STARTER_FILES,
    goal: 'data-cache-revalidation',
    pages: ['', 'data/fresh', 'data/cached', 'data/revalidate'],
    previewLabels: ['取得と保持の入口', '毎回取得', '保持した値', '期限後の更新'],
    readonlyFiles: [
      'app/globals.css',
      'app/layout.tsx',
      'app/data-url.ts',
      'app/page.tsx',
      'app/api/sample/route.ts',
    ],
  },
  'next-ch03-l02-e01': {
    files: WEATHER_STARTER_FILES,
    goal: 'loading-error-not-found',
    pages: ['', 'weather/clear', 'weather/slow', 'weather/flaky', 'weather/missing'],
    previewLabels: ['状態の入口', '正常な応答', '遅い応答', '一度失敗', '対象なし'],
    readonlyFiles: [
      'app/globals.css',
      'app/layout.tsx',
      'app/data-url.ts',
      'app/page.tsx',
      'app/api/weather/route.ts',
      'app/weather/[state]/not-found.tsx',
    ],
  },
});

/** 未知WorkspaceはNextの固定契約へ入れない。 */
export function nextWorkspace(id) {
  return Object.hasOwn(NEXT_WORKSPACES, id) ? NEXT_WORKSPACES[id] : undefined;
}

export function workspaceProfile(id) {
  return nextWorkspace(id) ? NEXT_PROFILE : 'vite-project-v1';
}
