import type { Exercise } from '../../core/content/types';
import type { ExecutionService } from '../../core/runtime/contracts';
import type { ValidatorAdapter } from '../../core/validation/contracts';

/** PagesはLocal moduleをimportしない。専用buildのaliasだけが実装へ置換する。 */
export interface LocalLearningRuntime {
  createExecution(exercise: Exercise, revision: string): ExecutionService | undefined;
  createValidator(exercise: Exercise): ValidatorAdapter | undefined;
}
export const localRuntime: LocalLearningRuntime | undefined = undefined;
