import { mountQuiz } from './quiz-ui.js';
import { loadQuestions } from './questions.js';
export type Category = 'web' | 'logic';
export type LoadMode = 'success' | 'invalid' | 'failure';
// 工程1: 問題の形を配列へ適用する
export interface Question {
  category: Category;
  text: string;
  choices: readonly string[];
  correct: string;
}
export interface QuizState {
  readonly index: number;
  readonly score: number;
  readonly answered: boolean;
}
export type LoadResult =
  | {
      kind: 'ready';
      questions: readonly Question[];
    }
  | {
      kind: 'invalid';
    }
  | {
      kind: 'failed';
      message: string;
    };
const questions: readonly Question[] = [
  {
    category: 'web',
    text: 'Webページの骨組みを作るのは？',
    choices: ['HTML', 'CSS'],
    correct: 'HTML',
  },
  { category: 'web', text: '見た目を整えるのは？', choices: ['JavaScript', 'CSS'], correct: 'CSS' },
  { category: 'logic', text: '1 + 1 は？', choices: ['2', '3'], correct: '2' },
  { category: 'logic', text: '3 > 5 の結果は？', choices: ['true', 'false'], correct: 'false' },
];
const createState = (): QuizState => {
  return { index: 0, score: 0, answered: false };
};
const answer = (state: QuizState, question: Question, choice: string): QuizState => {
  if (state.answered) return state;
  return {
    index: state.index,
    score: state.score + (choice === question.correct ? 1 : 0),
    answered: true,
  };
};
const advance = (state: QuizState): QuizState => {
  if (!state.answered) return state;
  return { index: state.index + 1, score: state.score, answered: false };
};
const decodeQuestion = (value: unknown): Question | undefined => {
  return undefined;
};
const readQuestions =
  /** 成功後の実検証と、拒否時の実messageを区別してUIへ渡す。 */
  async (mode: LoadMode): Promise<LoadResult> => {
    return { kind: 'ready', questions };
  };
const readButton = (event: Event): HTMLButtonElement | undefined => {
  const target = event.currentTarget;
  return target instanceof HTMLButtonElement ? target : undefined;
};
mountQuiz({ questions, createState, answer, advance, load: readQuestions, readButton });
console.log('準備できました');
