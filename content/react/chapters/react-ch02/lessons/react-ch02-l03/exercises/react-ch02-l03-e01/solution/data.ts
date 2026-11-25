import type { Book } from './types';

export const initialBooks: readonly Book[] = [
  { id: 'stars', title: '星の地図', read: false },
  { id: 'rain', title: '雨の日の本', read: true },
  { id: 'forest', title: '森の記録', read: false },
];
