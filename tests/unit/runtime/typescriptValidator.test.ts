import { describe, expect, it, vi } from 'vitest';
import type { TypeScriptExerciseRuntime } from '../../../src/core/content/types';
import type { TypeScriptCompileResult } from '../../../src/adapters/runtime/typescript/compileTypeScript';
import type { ValidationContext, ValidationResult } from '../../../src/core/validation/contracts';
import { TypeScriptValidator } from '../../../src/adapters/validation/typescript/TypeScriptValidator';
import { typeScriptSourceHash } from '../../../src/adapters/runtime/typescript/typeScriptSourceHash';
import { validationContext, validationRule } from '../../fixtures/validation';

const runtime: TypeScriptExerciseRuntime = {
  kind: 'typescript',
  entryFile: 'main.ts',
  sourceType: 'module',
  capabilityProfile: 'dom',
  primaryOutput: 'preview',
};
/** 元ソースと同一世代の実行証拠を備えた採点入力を作る。 */
async function contextFixture(): Promise<ValidationContext> {
  const files = { 'index.html': '<main></main>', 'main.ts': 'const value: number = 1;' };
  const evidence = [
    {
      id: 'typescript.source-sha256',
      value: await typeScriptSourceHash(files, runtime, 'session-1', 4),
    },
  ];
  return validationContext({
    files,
    runtime,
    evidence,
    execution: {
      runId: 'run-1',
      backend: 'browser',
      engine: 'browser-js',
      exerciseSessionId: 'session-1',
      executionRevision: 4,
      status: 'succeeded',
      diagnostics: [],
      evidence,
      console: [],
    },
  });
}
/** Compiler・動作Validatorの呼出し境界だけを観測する。実処理の結合はBrowserで確認する。 */
function fixture() {
  const compiler = {
    compile: vi.fn<() => Promise<TypeScriptCompileResult>>().mockResolvedValue({
      status: 'ready',
      files: { 'main.js': 'const value = 1;' },
      sourceMaps: {},
    }),
    dispose: vi.fn(),
  };
  const validate = vi
    .fn<(context: ValidationContext) => Promise<ValidationResult>>()
    .mockResolvedValue({
      exerciseId: 'exercise-1',
      executionRevision: 4,
      status: 'incomplete',
      checks: [],
      passedRequirementIds: [],
      diagnostics: [],
      evaluatedAt: 'now',
    });
  const validator = new TypeScriptValidator({
    compilerFactory: () => compiler,
    validatorFactory: () => ({ validate, buildSnapshotPolicy: vi.fn() }),
  });
  return { compiler, validate, validator };
}

describe('TypeScriptValidator', () => {
  it('型検査成功を合格にせず、生成JSとHTMLを動作採点へ渡す', async () => {
    const f = fixture();
    const context = await contextFixture();
    expect((await f.validator.validate(context)).status).toBe('incomplete');
    expect(f.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        files: { 'index.html': '<main></main>', 'main.js': 'const value = 1;' },
        runtime: { ...runtime, kind: 'javascript', entryFile: 'main.js' },
        evidence: context.evidence,
      }),
    );
    expect(context.files['main.ts']).toContain(': number');
    expect(f.compiler.dispose).toHaveBeenCalledOnce();
  });
  it.each(['type-only', 'html', 'runtime', 'revision', 'missing', 'duplicate'])(
    '%sの変更・欠落は古い実行証拠で採点しない',
    async (change) => {
      const f = fixture();
      const original = await contextFixture();
      const context: ValidationContext = {
        ...original,
        ...(change === 'type-only'
          ? { files: { ...original.files, 'main.ts': 'const value: 1 = 1;' } }
          : {}),
        ...(change === 'html'
          ? { files: { ...original.files, 'index.html': '<main>changed</main>' } }
          : {}),
        ...(change === 'runtime'
          ? { runtime: { ...runtime, capabilityProfile: 'project' as const } }
          : {}),
        ...(change === 'revision'
          ? { snapshots: { desktop: { ...original.snapshots.desktop!, executionRevision: 5 } } }
          : {}),
        ...(change === 'missing' ? { evidence: [] } : {}),
        ...(change === 'duplicate'
          ? { evidence: [...original.evidence, ...original.evidence] }
          : {}),
      };
      expect(await f.validator.validate(context)).toMatchObject({
        status: 'system-error',
        checks: [],
      });
      expect(f.compiler.compile).not.toHaveBeenCalled();
      expect(f.validate).not.toHaveBeenCalled();
    },
  );
  it('型失敗とWorker障害を不正解にせず、必ずWorkerを解放する', async () => {
    const f = fixture();
    f.compiler.compile
      .mockResolvedValueOnce({ status: 'type-error', diagnostics: [] })
      .mockRejectedValueOnce(new Error('worker failed'));
    const context = await contextFixture();
    expect((await f.validator.validate(context)).status).toBe('system-error');
    expect((await f.validator.validate(context)).status).toBe('system-error');
    expect(f.validate).not.toHaveBeenCalled();
    expect(f.compiler.dispose).toHaveBeenCalledTimes(2);
  });
  it('型消去後のJS ASTルールをTS教材要件の代わりに採点しない', async () => {
    const f = fixture();
    const context = await contextFixture();
    const result = await f.validator.validate({
      ...context,
      rules: [
        {
          ...validationRule(),
          target: { kind: 'javascript-source', file: 'main.ts' },
          assertion: {
            kind: 'javascript-source-fact',
            fact: { kind: 'binding', name: 'value', declarationKind: 'const' },
          },
        },
      ],
    });
    expect(result.status).toBe('system-error');
    expect(f.compiler.compile).not.toHaveBeenCalled();
  });
  it('ファイル順序は証拠に影響せず、実行世代の変更は区別する', async () => {
    const files = { 'main.ts': 'const n = 1;', 'index.html': '<main></main>' };
    const hash = await typeScriptSourceHash(files, runtime, 'session', 1);
    expect(
      await typeScriptSourceHash(
        { 'index.html': files['index.html'], 'main.ts': files['main.ts'] },
        runtime,
        'session',
        1,
      ),
    ).toBe(hash);
    expect(await typeScriptSourceHash(files, runtime, 'session', 2)).not.toBe(hash);
  });
});
