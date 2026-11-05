import type { QuizState as State, Question } from './types';
export function createState(): State {
  return { index: 0, score: 0, answered: false };
}
export function answer(state: State, question: Question, choice: string): State {
  if (state.answered) return state;
  return {
    ...state,
    score: state.score + (choice === question.correctId ? 1 : 0),
    answered: true,
  };
}
export function advance(state: State): State {
  if (!state.answered) return state;
  return { ...state, index: state.index + 1, answered: false };
}
