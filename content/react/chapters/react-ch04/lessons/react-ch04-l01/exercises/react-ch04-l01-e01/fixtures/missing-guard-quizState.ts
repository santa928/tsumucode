import type { QuizState, Question } from './types';
export function createState(): QuizState {
  return { index: 0, score: 0, answered: false };
}
export function answer(state: QuizState, question: Question, choice: string): QuizState {
  return {
    ...state,
    score: state.score + (choice === question.correctId ? 1 : 0),
    answered: choice === question.correctId,
  };
}
export function advance(state: QuizState): QuizState {
  if (!state.answered) return state;
  return { ...state, index: state.index + 1, answered: false };
}
