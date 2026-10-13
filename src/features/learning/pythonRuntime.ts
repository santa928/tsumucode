import { PYTHON_LESSONS } from '../../core/runtime/pythonLessonProfiles.mjs';
import type { CourseIndex, Exercise } from '../../core/content/types';
import { PythonExecutionService } from '../../adapters/runtime/python/PythonExecutionService';
import { loadPythonCore } from '../../adapters/runtime/python/loadPythonCore';
import type { ExecutionPreparationProgress } from '../../core/runtime/contracts';
import { PythonLessonValidator } from '../../adapters/validation/python/PythonLessonValidator';
import type { CourseRuntimeServices } from './javascriptRuntimeServices';

/** 通常の読み書き・Controllerを維持し、Python最小演習だけをConsole factoryへ接続する。 */
export function preparePythonCourse(
  course: Pick<CourseIndex, 'id' | 'runnerId' | 'validatorId'>,
  services: CourseRuntimeServices,
): void {
  if (
    !['python-basics', 'python-practice'].includes(course.id) ||
    course.runnerId !== 'python' ||
    course.validatorId !== 'python'
  )
    throw new Error('Python最小Courseの宣言が一致しません');
  if (!services.editorLanguageRegistry.has('python'))
    services.editorLanguageRegistry.register('python', () => []);
}

/** 実行・採点の適用条件を一組で返す。Python用coreはfactory生成時には取得しない。 */
type PythonCandidate = Pick<
  Exercise,
  'id' | 'runtime' | 'validationRules' | 'interactionScenarios'
>;

export function selectBrowserConsoleRuntime(
  exercise: PythonCandidate,
  validationExercises: readonly PythonCandidate[],
) {
  const eligible = (item: PythonCandidate): boolean =>
    Object.hasOwn(PYTHON_LESSONS, item.id) &&
    item.runtime?.kind === 'python' &&
    PYTHON_LESSONS[item.id]?.profile === item.runtime.profile &&
    (item.interactionScenarios?.length ?? 0) === 0;
  if (
    !eligible(exercise) ||
    validationExercises.length !== 1 ||
    !validationExercises.every(eligible)
  )
    throw new Error('Python最小演習の適用条件が一致しません');
  return {
    createExecution: (
      readInputLines?: () => readonly string[],
      reportProgress?: (progress: ExecutionPreparationProgress) => void,
    ) =>
      new PythonExecutionService(
        loadPythonCore,
        PYTHON_LESSONS[exercise.id]!.profile,
        readInputLines,
        reportProgress,
      ),
    createValidator: () => new PythonLessonValidator(),
  };
}
