import { describe, expect, it, vi } from 'vitest';
import type { TypeScriptExerciseRuntime } from '../../../src/core/content/types';
import type { TypeScriptCompileResult } from '../../../src/adapters/runtime/typescript/compileTypeScript';
import type {
  ValidationContext,
  ValidationResult,
  ValidatorRule,
} from '../../../src/core/validation/contracts';
import {
  TypeScriptLearningRuleDefinitionSchema,
  ValidationRuleDefinitionSchema,
} from '../../../src/core/content/schema';
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
  const learningRule: ValidatorRule = {
    ...validationRule(),
    id: 'annotation',
    target: { kind: 'typescript-learning', file: 'main.ts' },
    assertion: { kind: 'typescript-learning', profile: 'score-number-annotation-v1' },
  };
  const consoleRule: ValidatorRule = {
    ...validationRule(),
    id: 'output',
    target: { kind: 'javascript-console' },
    assertion: {
      kind: 'javascript-console',
      operator: 'equals',
      expected: [{ level: 'log', text: '2' }],
    },
  };

  it.each([
    ['typescript-ch03-l01-e01', 'union-result-v1', ['2', 'もう一度']],
    ['typescript-ch03-l02-e01', 'optional-hint-v1', ['2', 'ヒントなし', '0']],
  ] as const)(
    '%sの分岐条件と動作をANDにし、profile・Rule・世代不一致を閉じる',
    async (exerciseId, profile, outputs) => {
      const original = await contextFixture();
      const f = fixture();
      const facts = {
        typeShapeAccepted: true,
        parameterAnnotationAccepted: true,
        branchesUseValue: true,
        callsAccepted: true,
        forbiddenEscapeAbsent: true,
        positiveProbeAccepted: true,
        negativeProbesRejected: true,
      };
      const compiler = {
        ...f.compiler,
        conditionalCheck: vi.fn().mockResolvedValue({ status: 'ready', profile, facts }),
      };
      const validator = new TypeScriptValidator({
        compilerFactory: () => compiler,
        validatorFactory: () => ({ validate: f.validate, buildSnapshotPolicy: vi.fn() }),
      });
      const context: ValidationContext = {
        ...original,
        exerciseId,
        rules: [
          { ...learningRule, assertion: { kind: 'typescript-learning', profile } },
          {
            ...consoleRule,
            assertion: {
              kind: 'javascript-console',
              operator: 'equals',
              expected: outputs.map((text) => ({ level: 'log', text })),
            },
          },
        ],
      };
      expect((await validator.validate(context)).status).toBe('incomplete');
      expect(compiler.conditionalCheck).toHaveBeenCalledWith(
        { sessionId: 'session-1', revision: 4, files: { 'main.ts': original.files['main.ts'] } },
        profile,
      );
      f.validate.mockResolvedValue({
        exerciseId,
        executionRevision: 4,
        status: 'pass',
        checks: [],
        passedRequirementIds: [],
        diagnostics: [],
        evaluatedAt: 'now',
      });
      expect((await validator.validate(context)).status).toBe('pass');
      compiler.conditionalCheck.mockResolvedValue({
        status: 'ready',
        profile,
        facts: {
          ...facts,
          branchesUseValue: false,
          positiveProbeAccepted: false,
          negativeProbesRejected: false,
        },
      });
      expect((await validator.validate(context)).status).toBe('incomplete');
      compiler.conditionalCheck.mockResolvedValue({
        status: 'ready',
        profile: profile === 'union-result-v1' ? 'optional-hint-v1' : 'union-result-v1',
        facts,
      });
      expect((await validator.validate(context)).status).toBe('system-error');
      expect((await validator.validate({ ...context, rules: [context.rules[1]!] })).status).toBe(
        'system-error',
      );
      expect((await validator.validate({ ...context, exerciseId: 'other-e01' })).status).toBe(
        'system-error',
      );
      expect(
        (
          await validator.validate({
            ...context,
            rules: [
              context.rules[0]!,
              {
                ...context.rules[1]!,
                assertion: {
                  kind: 'javascript-console',
                  operator: 'equals',
                  expected: [{ level: 'log', text: outputs[0] }],
                },
              },
            ],
          })
        ).status,
      ).toBe('system-error');
      compiler.conditionalCheck.mockClear();
      expect(
        (
          await validator.validate({
            ...context,
            files: { ...context.files, 'main.ts': 'console.log(2);' },
          })
        ).status,
      ).toBe('system-error');
      expect(compiler.conditionalCheck).not.toHaveBeenCalled();
    },
  );

  it('Questionの型条件と動作をANDで判定し、新コードと古い証拠を組み合わせない', async () => {
    const original = await contextFixture();
    const f = fixture();
    const facts = {
      programShapeAccepted: true,
      interfaceAnnotationAccepted: true,
      requiredFieldsAccepted: true,
      dataValuesAccepted: true,
      forbiddenEscapeAbsent: true,
      logsIndexedChoiceLast: true,
      positiveProbeAccepted: true,
      negativeProbesRejected: true,
    };
    const compiler = {
      ...f.compiler,
      questionCheck: vi.fn().mockResolvedValue({ status: 'ready', facts }),
    };
    const validator = new TypeScriptValidator({
      compilerFactory: () => compiler,
      validatorFactory: () => ({ validate: f.validate, buildSnapshotPolicy: vi.fn() }),
    });
    const context = {
      ...original,
      exerciseId: 'typescript-ch02-l01-e01',
      rules: [
        {
          ...learningRule,
          assertion: { kind: 'typescript-learning', profile: 'question-interface-v1' },
        },
        {
          ...consoleRule,
          assertion: {
            kind: 'javascript-console',
            operator: 'equals',
            expected: [{ level: 'log', text: '内容' }],
          },
        },
      ],
    };
    expect((await validator.validate(context)).status).toBe('incomplete');
    expect(compiler.questionCheck).toHaveBeenCalledWith({
      sessionId: 'session-1',
      revision: 4,
      files: { 'main.ts': original.files['main.ts'] },
    });
    f.validate.mockResolvedValue({
      exerciseId: context.exerciseId,
      executionRevision: 4,
      status: 'pass',
      checks: [],
      passedRequirementIds: [],
      diagnostics: [],
      evaluatedAt: 'now',
    });
    expect((await validator.validate(context)).status).toBe('pass');
    compiler.questionCheck.mockResolvedValue({
      status: 'ready',
      facts: {
        ...facts,
        interfaceAnnotationAccepted: false,
        positiveProbeAccepted: false,
        negativeProbesRejected: false,
      },
    });
    expect((await validator.validate(context)).status).toBe('incomplete');
    compiler.questionCheck.mockClear();
    const stale = await validator.validate({
      ...context,
      files: { ...context.files, 'main.ts': 'console.log("内容");' },
    });
    expect(stale.status).toBe('system-error');
    expect(stale.diagnostics.map(({ code }) => code)).toContain('TYPESCRIPT_SOURCE_HASH_MISMATCH');
    expect(compiler.questionCheck).not.toHaveBeenCalled();
    expect((await validator.validate({ ...context, rules: [context.rules[1]!] })).status).toBe(
      'system-error',
    );
    expect((await validator.validate({ ...context, exerciseId: 'other-lesson-e01' })).status).toBe(
      'system-error',
    );
  });

  it('型推論は専用profileで同一原文を検査し、動作条件とANDで合格させる', async () => {
    const original = await contextFixture();
    const f = fixture();
    const facts = {
      programShapeAccepted: true,
      unannotatedLetDeclaration: true,
      forbiddenEscapeAbsent: true,
      logsScoreLast: true,
      positiveProbeAccepted: true,
      negativeProbeRejected: true,
    };
    const compiler = {
      ...f.compiler,
      inferenceCheck: vi.fn().mockResolvedValue({ status: 'ready', facts }),
    };
    const validator = new TypeScriptValidator({
      compilerFactory: () => compiler,
      validatorFactory: () => ({ validate: f.validate, buildSnapshotPolicy: vi.fn() }),
    });
    const context = {
      ...original,
      exerciseId: 'typescript-ch01-l01-e01',
      rules: [
        {
          ...learningRule,
          assertion: { kind: 'typescript-learning', profile: 'score-number-inference-v1' },
        },
        consoleRule,
      ],
    };
    expect((await validator.validate(context)).status).toBe('incomplete');
    expect(compiler.inferenceCheck).toHaveBeenCalledWith({
      sessionId: 'session-1',
      revision: 4,
      files: { 'main.ts': original.files['main.ts'] },
    });
    f.validate.mockResolvedValue({
      exerciseId: context.exerciseId,
      executionRevision: 4,
      status: 'pass',
      checks: [],
      passedRequirementIds: [],
      diagnostics: [],
      evaluatedAt: 'now',
    });
    const success = await validator.validate(context);
    expect(success.status).toBe('pass');
    expect(success.checks.at(-1)?.message).toContain('型推論');
    compiler.inferenceCheck.mockResolvedValue({
      status: 'ready',
      facts: {
        ...facts,
        unannotatedLetDeclaration: false,
        positiveProbeAccepted: false,
        negativeProbeRejected: false,
      },
    });
    expect((await validator.validate(context)).status).toBe('incomplete');
  });

  it('型推論Lessonでも型Rule欠落・別profile・Console改変を拒否する', async () => {
    const original = await contextFixture();
    const f = fixture();
    const inferenceRule = {
      ...learningRule,
      assertion: { kind: 'typescript-learning', profile: 'score-number-inference-v1' },
    };
    for (const rules of [
      [consoleRule],
      [learningRule, consoleRule],
      [inferenceRule, { ...consoleRule, group: 'any' as const }],
    ])
      expect(
        (await f.validator.validate({ ...original, exerciseId: 'typescript-ch01-l01-e01', rules }))
          .status,
      ).toBe('system-error');
    expect(f.compiler.compile).not.toHaveBeenCalled();
  });

  it('型Ruleは単一profile/file・必須allのみを許し、公開汎用payloadへ逃がさない', () => {
    expect(TypeScriptLearningRuleDefinitionSchema.safeParse(learningRule).success).toBe(true);
    for (const change of [
      { group: 'any' },
      { required: false },
      { groupId: 'shared' },
      { target: { kind: 'typescript-learning', file: 'other.ts' } },
      { assertion: { kind: 'typescript-learning', profile: 'unknown' } },
      { assertion: { kind: 'exists' } },
    ]) {
      expect(ValidationRuleDefinitionSchema.safeParse({ ...learningRule, ...change }).success).toBe(
        false,
      );
    }
  });

  it('重複型Rule・別Lesson・動作条件欠落は採点前に拒否する', async () => {
    const f = fixture();
    const original = await contextFixture();
    for (const context of [
      { ...original, rules: [learningRule, consoleRule] },
      { ...original, exerciseId: 'typescript-ch01-l02-e01', rules: [learningRule] },
      { ...original, exerciseId: 'typescript-ch01-l02-e01', rules: [consoleRule] },
      {
        ...original,
        exerciseId: 'typescript-ch01-l02-e01',
        rules: [learningRule, learningRule, consoleRule],
      },
    ])
      expect((await f.validator.validate(context)).status).toBe('system-error');
    expect(f.compiler.compile).not.toHaveBeenCalled();
  });

  it.each(['wrong-output', 'any-output', 'grouped-output', 'duplicate-output'] as const)(
    '型注釈LessonのConsole契約の改変を採点前に拒否する: %s',
    async (change) => {
      const f = fixture();
      const output = structuredClone(consoleRule);
      if (change === 'wrong-output')
        output.assertion = {
          kind: 'javascript-console',
          operator: 'equals',
          expected: [{ level: 'log', text: '3' }],
        };
      if (change === 'any-output') output.group = 'any';
      if (change === 'grouped-output') output.groupId = 'shared';
      const result = await f.validator.validate({
        ...(await contextFixture()),
        exerciseId: 'typescript-ch01-l02-e01',
        rules: [
          learningRule,
          output,
          ...(change === 'duplicate-output' ? [{ ...output, id: 'output-other' }] : []),
        ],
      });
      expect(result).toMatchObject({ status: 'system-error', checks: [] });
      expect(result.diagnostics.some(({ code }) => code === 'TYPESCRIPT_LEARNING_CONTRACT')).toBe(
        true,
      );
      expect(f.compiler.compile).not.toHaveBeenCalled();
      expect(f.validate).not.toHaveBeenCalled();
    },
  );

  it('型check環境失敗をincompleteにせず、動作採点も実行しない', async () => {
    const original = await contextFixture();
    const f = fixture();
    const compiler = {
      ...f.compiler,
      learningCheck: vi.fn().mockResolvedValue({ status: 'system-error' }),
    };
    const validator = new TypeScriptValidator({
      compilerFactory: () => compiler,
      validatorFactory: () => ({ validate: f.validate, buildSnapshotPolicy: vi.fn() }),
    });
    const result = await validator.validate({
      ...original,
      exerciseId: 'typescript-ch01-l02-e01',
      rules: [learningRule, consoleRule],
    });
    expect(result).toMatchObject({ status: 'system-error', checks: [] });
    expect(f.validate).not.toHaveBeenCalled();
    expect(compiler.dispose).toHaveBeenCalledOnce();
  });
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
