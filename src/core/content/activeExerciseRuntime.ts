import type { ExerciseRuntime } from './types';

/** 歴史的原本のデータ認識を、現行教材の配信・制作許可へ昇格させない。 */
export function assertActiveExerciseRuntime(runtime: ExerciseRuntime | undefined): void {
  if (runtime?.kind === 'python' && runtime.profile === 'function-return-scope-v1') {
    throw new Error('Retired Python exercise profile: function-return-scope-v1');
  }
}
