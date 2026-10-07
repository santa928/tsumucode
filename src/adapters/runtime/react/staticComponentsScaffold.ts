/** 起動と型を固定し、学習者は純粋な表示Componentだけを編集する。 */
export const STATIC_COMPONENTS_MAIN = `import { createRoot } from 'react-dom/client';
import { App } from './components';

const container = document.getElementById('root');
if (container === null) throw new Error('表示先がありません');
createRoot(container).render(<App />);
`;

/** childrenは今回の単一JSXを受け取る型。一般ReactNodeへ拡張しない。 */
export const STATIC_COMPONENTS_TYPES = `import type { ReactElement } from 'react';

export type { ReactElement };

export interface CardProps {
  readonly title: string;
  readonly summary: string;
}

export interface PanelProps {
  readonly children: ReactElement;
}
`;

export const STATIC_COMPONENTS_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>Componentの組み合わせ</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: sans-serif;
        line-height: 1.7;
      }
      section {
        margin: 16px 0;
        padding: 16px;
        border: 1px solid #666;
        overflow-wrap: anywhere;
      }
      h1 {
        font-size: 1.4rem;
      }
      h2 {
        font-size: 1.2rem;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

/** Importでも起動コード・型・HTMLを差し替えられない4ファイルの契約。 */
export function isStaticComponentsWorkspace(files: Readonly<Record<string, string>>): boolean {
  return (
    Object.keys(files).sort().join(',') === 'components.tsx,index.html,main.tsx,types.ts' &&
    isStaticComponentsScaffold(files) &&
    files['index.html']?.trim() === STATIC_COMPONENTS_HTML.trim()
  );
}

/** Compilerへ渡すTS/TSXにも同じ固定原稿を要求する。 */
export function isStaticComponentsScaffold(files: Readonly<Record<string, string>>): boolean {
  return (
    files['main.tsx']?.trim() === STATIC_COMPONENTS_MAIN.trim() &&
    files['types.ts']?.trim() === STATIC_COMPONENTS_TYPES.trim()
  );
}
