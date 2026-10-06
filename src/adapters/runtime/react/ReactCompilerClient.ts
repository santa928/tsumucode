import { TypeScriptCompilerClient } from '../typescript/TypeScriptCompilerClient';
import { isReactCompileInput, isReactCompileResult } from './compilerContract';

/** TSの期限・停止・旧応答拒否を再利用し、React専用Workerだけを遅延生成する。 */
export function createReactCompilerClient(): TypeScriptCompilerClient {
  return new TypeScriptCompilerClient({
    workerFactory: () =>
      new Worker(new URL('./compilerWorker.ts', import.meta.url), { type: 'module' }),
    compileInputGuard: isReactCompileInput,
    compileResultGuard: isReactCompileResult,
  });
}
