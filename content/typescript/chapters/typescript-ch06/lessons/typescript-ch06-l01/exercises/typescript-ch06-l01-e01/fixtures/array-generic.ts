import { mountQuiz } from './quiz-ui.js';
import { loadQuestions } from './questions.js';

export type Category = 'web' | 'logic';
export type LoadMode = 'success' | 'invalid' | 'failure';
// 工程1: 問題の形を配列へ適用する
export interface Question {
  category: Category;
  text: string;
  choices: ReadonlyArray<string>;
  correct: string;
}
export interface QuizState {
  readonly index: number;
  readonly score: number;
  readonly answered: boolean;
}
export type LoadResult =
  | { kind: 'ready'; questions: readonly Question[] }
  | { kind: 'invalid' }
  | { kind: 'failed'; message: string };

const questions: ReadonlyArray<Question> = [
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

// 工程2: 正誤と回答済みを使って状態を更新する

/** 前の回答を引き継がない初期状態を作る。 */
function createState(): QuizState {
  return { index: 0, score: 0, answered: false };
}

/** 回答済みなら状態を保ち、正解だけ得点へ加える。 */
function answer(state: QuizState, question: Question, choice: string): QuizState {
  return state;
}

/** 回答した後だけ次の問題へ進む。 */
function advance(state: QuizState): QuizState {
  return state;
}

// 工程3: unknownを検証し非同期の結果と失敗を区別する

/** unknownの各項目と2つの選択肢を確認してから問題を作る。 */
function decodeQuestion(value: unknown): Question | undefined {
  return undefined;
}

/** 成功後の実検証と、拒否時の実messageを区別してUIへ渡す。 */
async function readQuestions(mode: LoadMode): Promise<LoadResult> {
  return { kind: 'ready', questions };
}

/** Eventが示す操作対象を確認して返す。 */
function readButton(event: Event): HTMLButtonElement | undefined {
  const target = event.currentTarget;
  return target instanceof HTMLButtonElement ? target : undefined;
}

mountQuiz({ questions, createState, answer, advance, load: readQuestions, readButton });
console.log('準備できました');
