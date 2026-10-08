// Nextの最初の通常Lessonだけを扱う。APIからprofileや設定を自由に選ばせない。
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

export function workspaceProfile(id) {
  return id === NEXT_WORKSPACE ? NEXT_PROFILE : 'vite-project-v1';
}
