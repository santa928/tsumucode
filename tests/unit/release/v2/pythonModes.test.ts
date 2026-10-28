// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compileCourse,
  type CompiledCourseArtifacts,
} from '../../../../scripts/content/compileCourse';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import { planRelease } from '../../../../scripts/release/v2/plan';
let python: CompiledCourseArtifacts;
beforeAll(async () => {
  python = await compileCourse('content/python-basics');
});
describe('Python preview inputs and native fixed grading inputs', () => {
  it('keeps the original empty-input negative and the native fixed-input success distinct', () => {
    const inventory = buildInventory([python]);
    const targets = planRelease(inventory).targets.filter(
      (target) =>
        target.exerciseId === 'python-basics-ch01-l03-e01' &&
        target.caseKind === 'authored' &&
        target.fixtureId === 'empty',
    );
    expect(targets.find(({ mode }) => mode === 'pyodide')?.expectedStatus).toBe('code-error');
    expect(targets.find(({ mode }) => mode === 'cpython')?.expectedStatus).toBe('pass');
    expect(targets.find(({ mode }) => mode === 'pyodide')?.sourceDigest).not.toBe(
      targets.find(({ mode }) => mode === 'cpython')?.sourceDigest,
    );
  });
  it('binds built-in Python solution/starter to executable authored inputs, rather than invented empty input', () => {
    const inventory = buildInventory([python]);
    const targets = planRelease(inventory).targets.filter(
      (target) => target.exerciseId === 'python-basics-ch01-l02-e01' && target.mode === 'pyodide',
    );
    for (const name of ['solution', 'starter']) {
      expect(targets.find((target) => target.caseKind === name)?.sourceDigest).toBe(
        targets.find((target) => target.caseKind === 'authored' && target.fixtureId === name)
          ?.sourceDigest,
      );
    }
  });
});

it('records actual native fixed-input execution separately and aliases only identical built-ins', async () => {
  const { createPythonFixtureObservations } =
    await import('../../../../scripts/release/v2/pythonCoverage');
  const { loadAuthoringCourse } = await import('../../../../scripts/content/compileCourse');
  const { fixtureFiles } = await import('../../../../scripts/release/v2/fixtureSource');
  const authoring = await loadAuthoringCourse('content/python-basics');
  const exercise = authoring.exercises.find(({ id }) => id === 'python-basics-ch01-l03-e01')!;
  const fixture = exercise.fixtures.find(({ id }) => id === 'empty')!;
  const files = fixtureFiles(exercise, fixture.files);
  const actual = {
    exerciseId: exercise.id,
    fixtureId: fixture.id,
    mode: 'cpython' as const,
    files,
    actualStatus: 'pass' as const,
  };
  const rows = createPythonFixtureObservations(authoring, actual);
  expect(rows.map(({ key }) => key)).toEqual([
    'python-basics/python-basics-ch01-l03/python-basics-ch01-l03-e01/authored/empty/cpython',
  ]);
  expect(() =>
    createPythonFixtureObservations(authoring, { ...actual, mode: 'pyodide', inputLines: [''] }),
  ).toThrow();
  expect(() =>
    createPythonFixtureObservations(authoring, { ...actual, files: { 'main.py': 'print(1)' } }),
  ).toThrow();
});
