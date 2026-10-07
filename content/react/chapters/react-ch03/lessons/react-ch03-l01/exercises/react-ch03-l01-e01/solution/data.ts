import type { Question } from './types';
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
