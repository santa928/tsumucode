import { LocalConsoleExecutionService } from './LocalConsoleExecutionService';

/** 既存Closureの固定Node profileだけを選ぶ互換入口。 */
export class LocalNodeExecutionService extends LocalConsoleExecutionService {
  constructor(exerciseId: string, contentRevision: string) {
    super(exerciseId, contentRevision, 'node');
  }
}
