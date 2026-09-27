import { LocalNodeExecutionService } from '../../adapters/runtime/local/LocalNodeExecutionService';
import { analyzeConsoleSourceFacts } from '../../adapters/runtime/javascript/analyzer/instrumentJavaScript';
import { JavaScriptValidator } from '../../adapters/validation/javascript/JavaScriptValidator';
import type { LocalLearningRuntime } from './localRuntime';

const EXERCISE_IDS = new Set([
  'javascript-ch03-l05-e01',
  'javascript-ch03-l05-e02',
  'javascript-ch03-l05-e03',
]);

/** 専用Local buildだけが持つ対象演習の組立て。API接続は明示実行時まで行わない。 */
export const localRuntime: LocalLearningRuntime = {
  createExecution(exercise, revision) {
    return EXERCISE_IDS.has(exercise.id)
      ? new LocalNodeExecutionService(exercise.id, revision)
      : undefined;
  },
  createValidator(exercise) {
    if (!EXERCISE_IDS.has(exercise.id)) return undefined;
    return new JavaScriptValidator({
      analyzerFactory: () => ({
        async analyze(input) {
          if ('files' in input)
            throw new Error('Local source analysis supports the fixed single file profile only');
          return analyzeConsoleSourceFacts({ ...input, requestId: crypto.randomUUID() });
        },
        async dispose() {
          /* 純粋なsource解析は再利用資源を保持しない。 */
        },
      }),
    });
  },
};
