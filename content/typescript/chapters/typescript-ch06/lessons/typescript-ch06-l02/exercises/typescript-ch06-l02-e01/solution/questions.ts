import type { LoadMode } from './main.js';

const records: readonly unknown[] = [
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
let afterFailure = false;

/** 通信せず同梱の値を返す。成功しても各要素の形はunknown。 */
export async function loadQuestions(mode: LoadMode): Promise<readonly unknown[]> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 80);
  });
  if (mode === 'failure') {
    afterFailure = true;
    throw new Error('読み込めませんでした。開始でやり直せます');
  }
  if (mode === 'invalid')
    return [{ category: 'web', text: 2, choices: ['HTML', 'CSS'], correct: 'HTML' }];
  return afterFailure ? [records[1], records[0], records[2], records[3]] : records;
}
