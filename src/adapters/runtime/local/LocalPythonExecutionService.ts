import { LocalConsoleExecutionService } from './LocalConsoleExecutionService';

/** Python第一Lessonの固定CPython profile。Browserへfallbackしない。 */
export class LocalPythonExecutionService extends LocalConsoleExecutionService {
  constructor(exerciseId: string, contentRevision: string) {
    super(exerciseId, contentRevision, 'cpython');
  }
}
