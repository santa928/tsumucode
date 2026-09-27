import { BrowserConsoleExecutionService } from '../../adapters/runtime/javascript/runner/BrowserConsoleExecutionService';
import { analyzeConsoleSourceFacts } from '../../adapters/runtime/javascript/analyzer/instrumentJavaScript';
import { JavaScriptValidator } from '../../adapters/validation/javascript/JavaScriptValidator';
import type { Exercise } from '../../core/content/types';
import type { ExecutionService } from '../../core/runtime/contracts';
import type { ValidatorAdapter } from '../../core/validation/contracts';

const EXERCISE_IDS = new Set([
  'javascript-ch03-l05-e01',
  'javascript-ch03-l05-e02',
  'javascript-ch03-l05-e03',
]);
interface ConsoleRuntimeFactories {
  createExecution(): ExecutionService;
  createValidator(): ValidatorAdapter;
}
type ConsoleCandidate = Pick<
  Exercise,
  'id' | 'runtime' | 'validationRules' | 'interactionScenarios'
>;

/** 対象IDだけでなく実workspaceの全ルール・操作・runtime宣言がConsole専用か確かめる。 */
function eligible(exercise: ConsoleCandidate): boolean {
  return (
    EXERCISE_IDS.has(exercise.id) &&
    exercise.runtime?.kind === 'javascript' &&
    exercise.runtime.entryFile === 'script.js' &&
    exercise.runtime.sourceType === 'script' &&
    exercise.runtime.primaryOutput === 'console' &&
    (exercise.interactionScenarios?.length ?? 0) === 0 &&
    exercise.validationRules.length > 0 &&
    exercise.validationRules.every(
      (rule) =>
        rule.target.kind === 'javascript-console' ||
        (rule.target.kind === 'javascript-source' && rule.target.file === 'script.js'),
    )
  );
}

/** JavaScript routeで遅延loadし、同じ適用条件の実行/採点を常に対で返す。Local Nodeからは使わない。 */
export function selectBrowserConsoleRuntime(
  exercise: ConsoleCandidate,
  validationExercises: readonly ConsoleCandidate[],
): ConsoleRuntimeFactories | undefined {
  if (
    !eligible(exercise) ||
    validationExercises.length === 0 ||
    !validationExercises.every(eligible)
  )
    return undefined;
  return {
    createExecution: () => new BrowserConsoleExecutionService(),
    createValidator: () =>
      new JavaScriptValidator({
        browserConsole: true,
        analyzerFactory: () => ({
          async analyze(input) {
            if ('files' in input) throw new Error('Console source facts require a single script');
            return analyzeConsoleSourceFacts({ ...input, requestId: crypto.randomUUID() });
          },
          async dispose() {
            /* 純粋なsource解析は再利用資源を持たない。 */
          },
        }),
      }),
  };
}
