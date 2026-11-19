import type { Question } from './types';
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
