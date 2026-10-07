import { createRoot } from 'react-dom/client';
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
