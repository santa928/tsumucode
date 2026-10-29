import type { AuthoringExercise } from '../../content/compileCourse';
import type { ExerciseFile } from '../../../src/core/content/types';
import { hashValue } from './identity';
/** Match the exact input record sent to a runtime, including fault injection and input lines. */
export function fixtureFiles(exercise: AuthoringExercise, payload: readonly ExerciseFile[]) {
  return Object.fromEntries(
    [...exercise.files, ...payload].map(({ path, content }) => [path, content]),
  );
}
export function fixtureSourceDigest(
  files: Readonly<Record<string, string>>,
  faultInjection?: string,
  inputLines?: readonly string[],
) {
  return hashValue({
    files,
    faultInjection: faultInjection ?? null,
    inputLines: inputLines ?? null,
  });
}

/** Built-in Python cases use real authored inputs; native grading has its own fixed input bank. */
export function builtinFixtureDigests(full: AuthoringExercise, python: boolean) {
  const solutionFiles = fixtureFiles(full, full.solutionFiles),
    starterFiles = fixtureFiles(full, []);
  const matchingInput = (files: Readonly<Record<string, string>>, positive: boolean) => {
    const match = full.fixtures.find(
      (fixture) =>
        hashValue(fixtureFiles(full, fixture.files)) === hashValue(files) &&
        (positive
          ? fixture.expectedStatus === 'pass'
          : fixture.expectedStatus !== 'pass' && fixture.expectedStatus !== 'system-error'),
    );
    if (python && !match)
      throw new Error('Python solution/starter needs an executable authored input: ' + full.id);
    return match?.inputLines;
  };
  return {
    solutionSourceDigest: fixtureSourceDigest(
      solutionFiles,
      undefined,
      python ? matchingInput(solutionFiles, true) : undefined,
    ),
    starterSourceDigest: fixtureSourceDigest(
      starterFiles,
      undefined,
      python ? matchingInput(starterFiles, false) : undefined,
    ),
    ...(python
      ? {
          nativeSolutionSourceDigest: fixtureSourceDigest(solutionFiles),
          nativeStarterSourceDigest: fixtureSourceDigest(starterFiles),
        }
      : {}),
  };
}
