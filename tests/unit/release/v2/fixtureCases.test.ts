// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../../../scripts/content/compileCourse';
import { createCases } from '../../../e2e/helpers/courseFixtureGate';

let typed: Awaited<ReturnType<typeof loadAuthoringCourse>>;
let html: Awaited<ReturnType<typeof loadAuthoringCourse>>;
beforeAll(async () => {
  [typed, html] = await Promise.all([
    loadAuthoringCourse('content/typescript'),
    loadAuthoringCourse('content/html-css'),
  ]);
});

describe('manifest fixtureの独立した選択identity', () => {
  it('builtinと同名authoredのstarter/solutionを重複や欠落なく列挙する', () => {
    const exercise = typed.exercises.find(({ id }) => id === 'typescript-ch06-l03-e01')!;
    const cases = createCases(typed.exercises).filter(
      ({ exercise: row }) => row.id === exercise.id,
    );
    const ids = cases.map(({ id }) => id);
    expect(ids).toHaveLength(exercise.fixtures.length + 2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(exercise.id + '/solution/solution');
    expect(ids).toContain(exercise.id + '/starter/starter');
    for (const fixture of exercise.fixtures) {
      expect(ids).toContain(exercise.id + '/authored/' + fixture.id);
    }
  });

  it('fixture単位に選んでも共有workspaceの他exerciseのassetを保持する', () => {
    const assets = [
      ...new Map(
        html.exercises.flatMap(({ assets }) => assets).map((asset) => [asset.id, asset]),
      ).values(),
    ];
    expect(assets.length).toBeGreaterThan(1);
    const source = typed.exercises[0]!;
    const exercises = [
      { ...source, id: 'shared-first', workspaceId: 'shared-workspace', assets: [assets[0]!] },
      { ...source, id: 'shared-second', workspaceId: 'shared-workspace', assets: [assets[1]!] },
    ];
    const selected = createCases(exercises).filter(
      ({ exercise }) => exercise.id === 'shared-first',
    );
    expect(selected.length).toBeGreaterThan(0);
    for (const row of selected) {
      expect(row.workspaceAssets.map(({ id }) => id).sort()).toEqual(
        [assets[0]!.id, assets[1]!.id].sort(),
      );
    }
  });
});
