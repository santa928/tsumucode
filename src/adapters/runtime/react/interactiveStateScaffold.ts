import { STATIC_COMPONENTS_MAIN } from './staticComponentsScaffold';

export const INTERACTIVE_STATE_MAIN = STATIC_COMPONENTS_MAIN;
export const INTERACTIVE_STATE_TYPES = `export interface Topic {
  readonly id: string;
  readonly label: string;
}
`;
export const INTERACTIVE_STATE_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>操作でStateを更新する</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: sans-serif;
        line-height: 1.7;
      }
      button {
        margin: 8px;
        padding: 12px;
        font: inherit;
      }
      button:focus-visible {
        outline: 3px solid #165dcc;
        outline-offset: 2px;
      }
      h1 {
        font-size: 1.4rem;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

/** 起動・項目のreadonly型を固定し、Stateを扱うComponentだけを編集対象とする。 */
export function isInteractiveStateScaffold(files: Readonly<Record<string, string>>): boolean {
  return (
    files['main.tsx']?.trim() === INTERACTIVE_STATE_MAIN.trim() &&
    files['types.ts']?.trim() === INTERACTIVE_STATE_TYPES.trim()
  );
}

/** Import・採点でも同じ4File契約を要求し、DOMや型の置換を拒否する。 */
export function isInteractiveStateWorkspace(files: Readonly<Record<string, string>>): boolean {
  return (
    Object.keys(files).sort().join(',') === 'components.tsx,index.html,main.tsx,types.ts' &&
    isInteractiveStateScaffold(files) &&
    files['index.html']?.trim() === INTERACTIVE_STATE_HTML.trim()
  );
}
