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
