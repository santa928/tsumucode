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
