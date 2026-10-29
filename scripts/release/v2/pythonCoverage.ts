import type { AuthoringCoursePackage } from '../../content/compileCourse';
import type { FixtureObservation } from './browserCoverage';
import { FixtureObservationSchema } from './browserCoverage';
import { builtinFixtureDigests, fixtureFiles, fixtureSourceDigest } from './fixtureSource';
import { hashValue } from './identity';
export interface PythonFixtureExecution {
  readonly exerciseId: string;
  readonly fixtureId: string;
  readonly mode: 'pyodide' | 'cpython';
  readonly files: Readonly<Record<string, string>>;
  readonly inputLines?: readonly string[];
  readonly actualStatus: FixtureObservation['actualStatus'];
}
/** Called only after real UI assertions. Mode/input identity is checked independently of the requested target list. */
export function createPythonFixtureObservations(
  authoring: AuthoringCoursePackage,
  actual: PythonFixtureExecution,
): FixtureObservation[] {
  const full = authoring.exercises.find(({ id }) => id === actual.exerciseId);
  const lesson = authoring.runtime.phases
    .flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons))
    .find(({ exercises }) => exercises.some(({ id }) => id === actual.exerciseId));
  const fixture = full?.fixtures.find(({ id }) => id === actual.fixtureId);
  if (
    !full ||
    full.runtime?.kind !== 'python' ||
    !lesson ||
    !fixture ||
    fixture.faultInjection ||
    (actual.mode === 'cpython' && actual.inputLines !== undefined)
  )
    throw new Error('Unknown or unsupported actual Python execution');
  const status =
    actual.mode === 'cpython'
      ? (fixture.expectedLocalStatus ?? fixture.expectedStatus)
      : fixture.expectedStatus;
  const expectedDigest = fixtureSourceDigest(
    fixtureFiles(full, fixture.files),
    undefined,
    actual.mode === 'pyodide' ? fixture.inputLines : undefined,
  );
  const sourceDigest = fixtureSourceDigest(actual.files, undefined, actual.inputLines);
  if (status !== actual.actualStatus || sourceDigest !== expectedDigest)
    throw new Error('Python mode, Source, inputs or actual status differ');
  const prefix = [authoring.runtime.id, lesson.id, full.id];
  const row = (kind: string, id: string) =>
    FixtureObservationSchema.parse({
      schemaVersion: 1,
      key: [...prefix, kind, id, actual.mode].join('/'),
      inputDigest: hashValue(full),
      sourceDigest,
      actualStatus: actual.actualStatus,
    });
  const rows = [row('authored', fixture.id)];
  const builtin = builtinFixtureDigests(full, true);
  for (const name of ['solution', 'starter'] as const) {
    const digest =
      actual.mode === 'cpython'
        ? name === 'solution'
          ? builtin.nativeSolutionSourceDigest
          : builtin.nativeStarterSourceDigest
        : name === 'solution'
          ? builtin.solutionSourceDigest
          : builtin.starterSourceDigest;
    const canonical = full.fixtures.find((candidate) => {
      const expected =
        actual.mode === 'cpython'
          ? (candidate.expectedLocalStatus ?? candidate.expectedStatus)
          : candidate.expectedStatus;
      return (
        fixtureSourceDigest(
          fixtureFiles(full, candidate.files),
          undefined,
          actual.mode === 'pyodide' ? candidate.inputLines : undefined,
        ) === digest &&
        (name === 'solution'
          ? expected === 'pass'
          : expected !== 'pass' && expected !== 'system-error')
      );
    });
    if (canonical?.id === fixture.id && sourceDigest === digest) rows.push(row(name, name));
  }
  return rows;
}
