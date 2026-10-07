import type { QuestionCardProps as Props } from './types';
export function QuestionCard({ question: item, answered: done, onAnswer: receive }: Props) {
  return (
    <section>
      <h2 id="question">{item.text}</h2>
      {item.choices.map((choice) => (
        <button
          key={choice}
          id={choice}
          type="button"
          disabled={done}
          onClick={() => receive(choice)}
        >
          {choice}
        </button>
      ))}
    </section>
  );
}
