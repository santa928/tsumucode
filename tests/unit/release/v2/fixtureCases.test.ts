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

// Different logical identities may share execution, but never lose their own oracles.
describe('manifest fixture execution sharing', () => {
  it('retains every logical identity and its stricter authored oracle', async () => {
    const { groupFixtureExecutions } = await import('../../../e2e/helpers/fixtureExecutionGroups');
    const cases = createCases(typed.exercises);
    const groups = groupFixtureExecutions(cases);
    expect(
      groups
        .flat()
        .map(({ id }) => id)
        .sort(),
    ).toEqual(cases.map(({ id }) => id).sort());
    const group = groups.find((rows) =>
      rows.some(({ id }) => id === 'typescript-ch06-l03-e01/starter/starter'),
    )!;
    expect(group.map(({ expectedStatus }) => expectedStatus)).toEqual(['not-pass', 'incomplete']);
    expect(group[1]!.expectedFeedbackRuleIds!.length).toBeGreaterThan(0);
    expect(group.every((row) => cases.includes(row))).toBe(true);
  });

  it('never shares a different exercise, files, fault, assets, runtime or conflicting oracle', async () => {
    const { groupFixtureExecutions } = await import('../../../e2e/helpers/fixtureExecutionGroups');
    const source = createCases(typed.exercises)[0]!;
    const withoutRuntime = { ...source.exercise };
    Reflect.deleteProperty(withoutRuntime, 'runtime');
    const variants = [
      { ...source, id: 'other-exercise', exercise: { ...source.exercise, id: 'other' } },
      { ...source, id: 'other-files', files: { ...source.files, 'other.ts': 'changed' } },
      { ...source, id: 'other-fault', faultInjection: 'stale-source-evidence' as const },
      { ...source, id: 'other-assets', workspaceAssets: [] },
      { ...source, id: 'other-runtime', exercise: withoutRuntime },
      { ...source, id: 'wrong-status', expectedStatus: 'code-error' as const },
      { ...source, id: 'wrong-diagnostic', expectedDiagnosticCodes: ['missing'] },
      { ...source, id: 'wrong-rule', expectedFeedbackRuleIds: ['missing'] },
    ];
    // Make each pair independently, so an unrelated variant cannot hide a bad merge.
    for (const variant of variants) {
      const base =
        variant.id === 'wrong-diagnostic' ? { ...source, expectedDiagnosticCodes: [] } : source;
      const assetBase =
        variant.id === 'other-assets'
          ? { ...base, workspaceAssets: html.exercises.flatMap(({ assets }) => assets) }
          : base;
      expect(groupFixtureExecutions([assetBase, variant]), variant.id).toHaveLength(2);
    }
    expect(groupFixtureExecutions([source, { ...source, id: 'same-input' }])).toHaveLength(1);
  });

  it.each(['not-pass', 'code-error'] as const)(
    'keeps a different runtime rejection policy separate from %s',
    async (expectedStatus) => {
      const { groupFixtureExecutions } = await import('../../../e2e/helpers/fixtureExecutionGroups');
      const source = createCases(typed.exercises)[0]!;
      const rejectsUnhandled = { ...source, id: 'rejects-unhandled', expectedStatus };
      const allowsRuntimeRejection = {
        ...source,
        id: 'allows-runtime-rejection',
        expectedStatus: 'code-error' as const,
        expectedDiagnosticCodes: ['javascript-runtime'],
      };
      // 同じ実行入力でも、片方が許可しないrejectionを他方の期待値で許可しない。
      expect(rejectsUnhandled).not.toHaveProperty('expectedDiagnosticCodes');
      for (const pair of [
        [rejectsUnhandled, allowsRuntimeRejection],
        [allowsRuntimeRejection, rejectsUnhandled],
      ]) {
        expect(groupFixtureExecutions(pair)).toHaveLength(2);
      }
    },
  );

  it('shares compatible inputs with the same runtime rejection policy', async () => {
    const { groupFixtureExecutions } = await import('../../../e2e/helpers/fixtureExecutionGroups');
    const source = createCases(typed.exercises)[0]!;
    const rejectsUnhandled = { ...source, id: 'starter', expectedStatus: 'not-pass' as const };
    const errorWithoutDiagnostics = {
      ...source,
      id: 'error-without-diagnostics',
      expectedStatus: 'code-error' as const,
    };
    const allowsRuntimeRejection = {
      ...errorWithoutDiagnostics,
      id: 'allows-runtime-rejection',
      expectedDiagnosticCodes: ['javascript-runtime'],
    };
    expect(groupFixtureExecutions([rejectsUnhandled, errorWithoutDiagnostics])).toHaveLength(1);
    expect(
      groupFixtureExecutions([
        allowsRuntimeRejection,
        { ...allowsRuntimeRejection, id: 'same-runtime-policy' },
      ]),
    ).toHaveLength(1);
  });

  it('keeps incompatible exact statuses separate even when a coarse starter is present', async () => {
    const { groupFixtureExecutions } = await import('../../../e2e/helpers/fixtureExecutionGroups');
    const source = createCases(typed.exercises)[0]!;
    const cases = [
      { ...source, id: 'starter', expectedStatus: 'not-pass' as const },
      { ...source, id: 'incomplete', expectedStatus: 'incomplete' as const },
      { ...source, id: 'code-error', expectedStatus: 'code-error' as const },
      { ...source, id: 'system-error', expectedStatus: 'system-error' as const },
    ];
    expect(groupFixtureExecutions(cases).map((rows) => rows.map(({ id }) => id))).toEqual([
      ['starter', 'incomplete'],
      ['code-error'],
      ['system-error'],
    ]);
  });
});
