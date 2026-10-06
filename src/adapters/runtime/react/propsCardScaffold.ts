/** 読み取り専用の足場。Importした下書きでも型と表示の目標を差し替えない。 */
export const PROPS_CARD_SOURCE = `
import type { ReactElement } from 'react';

export interface Question {
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly correctIndex: number;
}

/** 作者が渡した問題データを、回答操作のないカードとして表示する。 */
export function QuestionCard({ question }: { readonly question: Question }): ReactElement {
  return (
    <section aria-labelledby="question-prompt">
      <h1 id="question-prompt">{question.prompt}</h1>
      <ol>
        {question.choices.map((choice) => (
          <li key={choice}>{choice}</li>
        ))}
      </ol>
      <p>選択肢は{question.choices.length}個です</p>
    </section>
  );
}
`;

const PROPS_HTML_SOURCE = `
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>型付きの問題カード</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: sans-serif;
        line-height: 1.7;
      }
      section {
        max-width: 40rem;
        padding: 20px;
        border: 1px solid #666;
        overflow-wrap: anywhere;
      }
      h1 {
        margin-top: 0;
        font-size: 1.4rem;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

/** このprofileのHTMLとFile集合を固定し、別DOMによる採点の迂回を拒否する。 */
export function isPropsWorkspace(files: Readonly<Record<string, string>>): boolean {
  return (
    Object.keys(files).sort().join(',') === 'QuestionCard.tsx,index.html,main.tsx' &&
    files['index.html']?.trim() === PROPS_HTML_SOURCE.trim()
  );
}
