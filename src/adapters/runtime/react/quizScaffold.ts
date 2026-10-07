import type { ReactProfile } from './compilerContract';

export const QUIZ_MAIN = `import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { QuestionCard } from './QuestionCard';
import { questions } from './data';
import { createState, answer, advance } from './quizState';
function QuizShell() {
  const [state, setState] = useState(createState);
  const [name, setName] = useState('');
  const question = questions.at(state.index);
  function receive(choice: string) {
    document.getElementById('received')?.replaceChildren(choice);
    if (question) setState((previous) => answer(previous, question, choice));
  }
  function change(event: ChangeEvent<HTMLInputElement>) {
    setName(event.currentTarget.value);
  }
  return (
    <section>
      <label htmlFor="name">名前</label>
      <input id="name" value={name} onChange={change} />
      <p>
        得点: <output id="score">{state.score}</output>
      </p>
      {question ? (
        <QuestionCard question={question} answered={state.answered} onAnswer={receive} />
      ) : (
        <p id="result" role="status">
          全問終了
        </p>
      )}
      <button
        id="next"
        type="button"
        disabled={!state.answered || !question}
        onClick={() => setState((previous) => advance(previous))}
      >
        次の問題
      </button>
      <button id="retry" type="button" onClick={() => setState(createState())}>
        再挑戦
      </button>
    </section>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('表示先がありません');
createRoot(root).render(<QuizShell />);
`;

export const QUIZ_TYPES = `export interface Question {
  readonly text: string;
  readonly choices: readonly string[];
  readonly correctId: string;
}
export interface QuizState {
  readonly index: number;
  readonly score: number;
  readonly answered: boolean;
}
export interface QuestionCardProps {
  readonly question: Question;
  readonly answered: boolean;
  readonly onAnswer: (choice: string) => void;
}
`;

export const QUIZ_DATA = `import type { Question } from './types';
export const questions: readonly Question[] = [
  {
    text: 'ページの骨組みを作る言語は？',
    correctId: 'HTML',
    choices: ['HTML', 'CSS'],
  },
  {
    text: '見た目を整える言語は？',
    correctId: 'CSS',
    choices: ['JavaScript', 'CSS'],
  },
];
`;

export const QUIZ_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>練習クイズ</title>
  </head>
  <body>
    <h1>練習クイズ</h1>
    <p role="status">選んだ回答: <span id="received">未回答</span></p>
    <div id="root"></div>
  </body>
</html>
`;

export const PRACTICE_DATA = `import type { Question } from './types';
export const questions: readonly Question[] = [
  {
    text: '1 + 1 の結果は？',
    correctId: '2',
    choices: ['2', '3'],
  },
  {
    text: '3 > 5 の結果は？',
    correctId: 'false',
    choices: ['true', 'false'],
  },
];
`;

/** 固定のState所有者と観測を守り、2つの編集Fileへ責務を分ける。 */
export function isQuizScaffold(
  files: Readonly<Record<string, string>>,
  profile: ReactProfile,
): boolean {
  if (profile !== 'quiz-workshop-v1' && profile !== 'quiz-capstone-v1') return false;
  const fixed = {
    'main.tsx': QUIZ_MAIN,
    'types.ts': QUIZ_TYPES,
    'data.ts': profile === 'quiz-capstone-v1' ? PRACTICE_DATA : QUIZ_DATA,
  };
  return (
    Object.keys(files).sort().join(',') ===
      'QuestionCard.tsx,data.ts,main.tsx,quizState.ts,types.ts' &&
    Object.entries(fixed).every(([file, source]) => files[file]?.trim() === source.trim())
  );
}

/** 保存/Import/採点で同じ契約を使い、親のCallback観測をHTMLからも偽造させない。 */
export function isQuizWorkspace(
  files: Readonly<Record<string, string>>,
  profile: ReactProfile,
): boolean {
  const { 'index.html': html, ...typed } = files;
  return html?.trim() === QUIZ_HTML.trim() && isQuizScaffold(typed, profile);
}
