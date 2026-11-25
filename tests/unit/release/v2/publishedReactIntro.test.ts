// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { readAuthoringAtSource } from '../../../../scripts/release/v2/sourceInventory';
import {
  compareInitialReactCopyContract,
  learnerMovementOriginals,
  LearnerMovementOriginalsSchema,
  isPublishedReactIntroParent,
  verifyLearnerMovement,
} from '../../../../scripts/release/v2/learnerMovement';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { stageMoves } from '../../../../scripts/release/v2/movementStage';
import { learnerCarryFixture } from './learnerCarryFixture';

const publishedReactIntroSource = '820f572c29d6477b722394c29349d57611931855';
const moves = stageMoves('react-after-python');
const intro = 'react-ch01-l01';
let source: Awaited<ReturnType<typeof readAuthoringAtSource>>;
let fixture: Awaited<ReturnType<typeof learnerCarryFixture>>;

beforeAll(async () => {
  source = await readAuthoringAtSource(process.cwd(), publishedReactIntroSource, 'react');
  fixture = await learnerCarryFixture();
}, 30_000);

it('固定公開Sourceに続くReact段階だけを選ぶ', () => {
  expect(isPublishedReactIntroParent('react-after-python', publishedReactIntroSource)).toBe(true);
  expect(isPublishedReactIntroParent('joint', publishedReactIntroSource)).toBe(false);
  expect(isPublishedReactIntroParent('python-first', publishedReactIntroSource)).toBe(false);
  expect(isPublishedReactIntroParent('react-after-python', '0'.repeat(40))).toBe(false);
});

it('既公開の作者原本に旧2行の変更を要求せず、隠れた採点変更は拒否する', () => {
  const exercise = source.authoringExercises!.find((row) => row.id === intro + '-e01')!;
  expect(() => {
    compareInitialReactCopyContract(exercise, exercise, true);
  }).not.toThrow();
  expect(() => {
    compareInitialReactCopyContract(exercise, exercise, false);
  }).toThrow(/delta/u);
  const changed = { ...exercise, fixtures: [] };
  expect(() => {
    compareInitialReactCopyContract(changed, exercise, true);
  }).toThrow(/fixed original/u);
  expect(() => {
    compareInitialReactCopyContract(exercise, changed, true);
  }).toThrow(/fixed original/u);
});

it('同じ公開済み初回だけを通常の同一ID照合へ渡し、Reactの3移動は残す', () => {
  const old = structuredClone(fixture.baseline);
  old.sourceCommit = publishedReactIntroSource;
  const next = structuredClone(fixture.inventory);
  const original = learnerMovementOriginals([source.compilation], moves, 'previous').find(
    (row) => row.lessonId === intro,
  )!;
  const rows = (side: 'previous' | 'current') => [
    ...fixture.inputs.learnerOriginals[side].filter(
      (row) => row.courseId === 'react' && row.lessonId !== intro,
    ),
    original,
  ];
  const originals = LearnerMovementOriginalsSchema.parse({
    previous: rows('previous'),
    current: rows('current'),
  });
  function verify() {
    for (const [inventory, side] of [
      [old.inventory, 'previous'],
      [next, 'current'],
    ] as const) {
      const lesson = inventory.courses
        .find((row) => row.id === 'react')!
        .lessons.find((row) => row.id === intro)!;
      const row = originals[side].find((row) => row.lessonId === intro)!;
      lesson.learnerDigest = hashValue(row.projection);
    }
    return verifyLearnerMovement(
      originals,
      next,
      old,
      fixture.inputs.declaration.body.candidateContentCommit,
      fixture.inputs.declaration.declarationDigest,
      moves,
      true,
    );
  }
  expect([...verify().keys()].sort()).toEqual(moves.map(([, , to]) => 'react/' + to).sort());
  for (const side of ['previous', 'current'] as const) {
    const row = originals[side].find((item) => item.lessonId === intro)!;
    const intact = row.projection;
    row.projection = { ...intact, title: '片側だけの変更' };
    expect(verify).toThrow(/fixed original/u);
    row.projection = intact;
  }
});
