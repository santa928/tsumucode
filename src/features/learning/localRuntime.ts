import type { ComponentType } from 'react';
import type { Exercise } from '../../core/content/types';
import type { ExecutionService } from '../../core/runtime/contracts';
import type { ValidatorAdapter } from '../../core/validation/contracts';

/** 練習のSourceと一時UIだけを渡す。Progress/Validatorの参照を含めない。 */
export interface PythonPracticePanelProps {
  readonly exerciseId: string;
  readonly contentRevision: string;
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly files: Readonly<Record<string, string>>;
  readonly disabled: boolean;
  readonly onBusyChange: (busy: boolean) => void;
  readonly prepare: () => Promise<void>;
}

/** PagesはLocal moduleをimportしない。専用buildのaliasだけが実装へ置換する。 */
export interface LocalLearningRuntime {
  readonly PythonPracticePanel?: ComponentType<PythonPracticePanelProps>;
  createExecution(
    exercise: Exercise,
    revision: string,
    readInputLines?: () => readonly string[],
  ): ExecutionService | undefined;
  createValidator(exercise: Exercise): ValidatorAdapter | undefined;
}
export const localRuntime: LocalLearningRuntime | undefined = undefined;
