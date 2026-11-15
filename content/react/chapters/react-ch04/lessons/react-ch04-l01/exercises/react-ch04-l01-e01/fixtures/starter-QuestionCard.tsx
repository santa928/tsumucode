import type { QuestionCardProps } from './types';
export function QuestionCard({ question, answered, onAnswer }: QuestionCardProps) {
  return (
    <section>
      <h2 id="question">{question.text}</h2>
      {question.choices.map((choice, index) => (
        <button
          key={index}
          id={choice}
          type="button"
          disabled={answered}
          onClick={() => onAnswer(choice)}
        >
          {choice}
        </button>
      ))}
    </section>
  );
}
