import type { QuizState, Question } from './types';
export function createState(): QuizState {
  return { index: 0, score: 0, answered: false };
}
export function answer(state: QuizState, question: Question, choice: string): QuizState {
  if (state.answered) return state;
  const correct = choice === question.correctId;
  return {
    ...state,
    score: state.score + (correct ? 1 : 0),
    answered: true,
  };
}
export function advance(state: QuizState): QuizState {
  if (!state.answered) return state;
  return { ...state, index: state.index + 1, answered: false };
}
