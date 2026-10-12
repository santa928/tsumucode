import { expect, it } from 'vitest';
import { pythonFixedFixtures } from './pythonFixedFixtures.mjs';

it('無入力のLessonにも空suiteではなく入力なしの実行ケースを用意する', () => {
  expect(pythonFixedFixtures('range-loop-v1')).toEqual([
    { id: 'range', inputLines: [], expectedOutput: '0\n1\n2\n' },
  ]);
  expect(() => {
    Reflect.apply(pythonFixedFixtures, undefined, ['unknown']);
  }).toThrow();
});

it('呼出側で入力を変更しても作者の固定集合を変更しない', () => {
  Reflect.set(pythonFixedFixtures('input-echo-v1')[0]!.inputLines, '0', '変更');
  expect(pythonFixedFixtures('input-echo-v1')[0]!.inputLines).toEqual(['Ada']);
});
