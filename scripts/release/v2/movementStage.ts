import { z } from 'zod';

export const MOVEMENT_ID = 'python-functions-and-react-project-movement-v1';
export const PURE_MOVES = [
  ['python-basics', 'python-basics-ch01-l08', 'python-basics-ch01-l12', 12],
  ['python-basics', 'python-basics-ch01-l09', 'python-basics-ch01-l13', 16],
  ['react', 'react-ch02-l01', 'react-ch03-l01', 8],
  ['react', 'react-ch02-l02', 'react-ch03-l02', 9],
  ['react', 'react-ch03-l01', 'react-ch04-l01', 8],
] as const;
export const MovementStageSchema = z.enum(['joint', 'python-first', 'react-after-python']);
export type MovementStage = z.infer<typeof MovementStageSchema>;

/** 3つの閉じた集合だけ。JSONから任意subsetを登録しない。 */
export function stageMoves(stage: MovementStage) {
  if (stage === 'python-first') return PURE_MOVES.slice(0, 2);
  if (stage === 'react-after-python') return PURE_MOVES.slice(2);
  return PURE_MOVES;
}

export function stageRechecks(stage: MovementStage) {
  return [
    ...new Set([
      ...stageMoves(stage).flatMap(([course, from, to]) => [
        course + '/' + from,
        course + '/' + to,
      ]),
      ...(stage === 'react-after-python'
        ? []
        : ['07', '08', '09', '10', '11'].map((id) => 'python-basics/python-basics-ch01-l' + id)),
    ]),
  ];
}
