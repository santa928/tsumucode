import { TypeScriptCompilerClient } from '../typescript/TypeScriptCompilerClient';
import {
  isReactCompileInput,
  isReactCompileResult,
  type ReactCompileInput,
  type ReactCompileResult,
} from './compilerContract';

/** TSの期限・停止・旧応答拒否を再利用し、React専用Workerだけを遅延生成する。 */
export function createReactCompilerClient(): {
  compile(input: ReactCompileInput): Promise<ReactCompileResult>;
  dispose(): void;
} {
  const client = new TypeScriptCompilerClient({
    workerFactory: () =>
      new Worker(new URL('./compilerWorker.ts', import.meta.url), { type: 'module' }),
    compileInputGuard: isReactCompileInput,
    compileResultGuard: isReactCompileResult,
  });
  return {
    async compile(input) {
      const result = await client.compile(input);
      return isReactCompileResult(result, input)
        ? result
        : {
            status: 'environment-error',
            diagnostics: [
              {
                code: 0,
                message:
                  'Reactの型検査結果を確認できませんでした。コードを保持して再試行してください。',
              },
            ],
          };
    },
    dispose: () => {
      client.dispose();
    },
  };
}
