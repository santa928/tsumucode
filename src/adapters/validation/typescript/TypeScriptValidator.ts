import {
  TypeScriptExerciseRuntimeSchema,
  TypeScriptLearningRuleDefinitionSchema,
  TypeScriptAnnotationConsoleRuleSchema,
} from '../../../core/content/schema';
import type { ScoreNumberAnnotationResult } from '../../runtime/typescript/checkScoreNumberAnnotation';
import { isScoreNumberAnnotationResult } from '../../runtime/typescript/workerContract';
import type {
  ValidationContext,
  ValidationResult,
  ValidatorAdapter,
  ValidatorRule,
} from '../../../core/validation/contracts';
import type { SnapshotPolicy } from '../../../core/runtime/contracts';
import type { TypeScriptCompileResult } from '../../runtime/typescript/compileTypeScript';
import { TypeScriptCompilerClient } from '../../runtime/typescript/TypeScriptCompilerClient';
import { mapTypeScriptDiagnostics } from '../../runtime/typescript/mapTypeScriptDiagnostics';
import { typeScriptSourceHash } from '../../runtime/typescript/typeScriptSourceHash';
import {
  isTypeScriptCompileInput,
  type TypeScriptCompileInput,
} from '../../runtime/typescript/workerContract';
import { JavaScriptValidator } from '../javascript/JavaScriptValidator';

interface CompilerPort {
  compile(input: TypeScriptCompileInput): Promise<TypeScriptCompileResult>;
  learningCheck?(input: TypeScriptCompileInput): Promise<ScoreNumberAnnotationResult>;
  dispose(): void;
}
interface ValidatorOptions {
  readonly compilerFactory?: () => CompilerPort;
  readonly validatorFactory?: () => ValidatorAdapter;
}

/** 不一致や未対応の採点を学習者の不正解として保存しない。 */
function blocked(context: ValidationContext, code: string): ValidationResult {
  return {
    exerciseId: context.exerciseId,
    executionRevision: context.execution?.executionRevision ?? null,
    status: 'system-error',
    checks: [],
    passedRequirementIds: [],
    diagnostics: [
      ...context.diagnostics,
      {
        code,
        kind: 'system',
        severity: 'error',
        message: code,
        learnerMessage:
          '型を確認したコードと実行結果が一致しません。コードは保存されています。もう一度実行してください。',
      },
    ],
    evaluatedAt: context.now,
  };
}

/** 元TSの実行証拠とLesson固有の型要件を照合し、既存の動作条件とANDで採点する。 */
export class TypeScriptValidator implements ValidatorAdapter {
  constructor(private readonly options: ValidatorOptions = {}) {}

  /** 型消去後のASTで型の習得を判定せず、DOM・consoleの観測だけを用意する。 */
  buildSnapshotPolicy(rules: readonly ValidatorRule[]): SnapshotPolicy {
    return new JavaScriptValidator({ behaviorOnly: true }).buildSnapshotPolicy(
      rules.filter((rule) => rule.target.kind !== 'typescript-learning'),
    );
  }

  /** 型検査成功だけでは合格にしない。世代・元TS・生成JS・DOMの照合をすべて要求する。 */
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const files = { ...context.files };
    const parsed = TypeScriptExerciseRuntimeSchema.safeParse(context.runtime);
    const execution = context.execution;
    const learningRules = context.rules.filter(
      (rule) =>
        rule.target.kind === 'typescript-learning' || rule.assertion.kind === 'typescript-learning',
    );
    const behaviorRules = context.rules.filter((rule) => !learningRules.includes(rule));
    const consoleRules = behaviorRules.filter(
      (rule) =>
        rule.target.kind === 'javascript-console' || rule.assertion.kind === 'javascript-console',
    );
    const learningRule =
      learningRules[0] && TypeScriptLearningRuleDefinitionSchema.safeParse(learningRules[0]);
    if (
      (learningRules.length > 0 || context.exerciseId === 'typescript-ch01-l02-e01') &&
      (learningRules.length !== 1 ||
        !learningRule?.success ||
        context.exerciseId !== 'typescript-ch01-l02-e01' ||
        context.rules.some(
          (rule) =>
            rule !== learningRules[0] &&
            (rule.id === learningRules[0]!.id || rule.groupId === learningRules[0]!.id),
        ) ||
        consoleRules.length !== 1 ||
        !TypeScriptAnnotationConsoleRuleSchema.safeParse(consoleRules[0]).success)
    )
      return blocked(context, 'TYPESCRIPT_LEARNING_CONTRACT');
    if (
      !parsed.success ||
      !execution ||
      execution.backend !== 'browser' ||
      execution.engine !== 'browser-js' ||
      !['succeeded', 'code-error'].includes(execution.status) ||
      context.rules.some((rule) => rule.target.kind === 'javascript-source') ||
      Object.keys(files).some((file) => !/\.(?:ts|html|css)$/u.test(file)) ||
      !Object.hasOwn(files, parsed.data.entryFile)
    )
      return blocked(context, 'TYPESCRIPT_VALIDATION_CONTRACT');

    const runtime = parsed.data;
    const input = {
      sessionId: execution.exerciseSessionId,
      revision: execution.executionRevision,
      files: Object.fromEntries(Object.entries(files).filter(([file]) => file.endsWith('.ts'))),
    };
    if (
      !isTypeScriptCompileInput(input) ||
      Object.values(context.snapshots).some(
        (snapshot) =>
          snapshot.exerciseSessionId !== input.sessionId ||
          snapshot.executionRevision !== input.revision,
      )
    )
      return blocked(context, 'TYPESCRIPT_VALIDATION_IDENTITY');

    let compiler: CompilerPort | undefined;
    try {
      const proofs = context.evidence.filter(({ id }) => id === 'typescript.source-sha256');
      if (
        proofs.length !== 1 ||
        proofs[0]?.file !== undefined ||
        proofs[0]?.value !==
          (await typeScriptSourceHash(files, runtime, input.sessionId, input.revision))
      ) {
        return blocked(context, 'TYPESCRIPT_SOURCE_HASH_MISMATCH');
      }
      compiler = this.options.compilerFactory?.() ?? new TypeScriptCompilerClient();
      const compiled = await compiler.compile(input);
      if (compiled.status !== 'ready') return blocked(context, 'TYPESCRIPT_VALIDATION_COMPILE');
      let learningResult: ScoreNumberAnnotationResult | undefined;
      if (learningRule?.success) {
        learningResult = await compiler.learningCheck?.(input);
        if (!isScoreNumberAnnotationResult(learningResult) || learningResult.status !== 'ready')
          return blocked(context, 'TYPESCRIPT_LEARNING_UNAVAILABLE');
      }
      const validator =
        this.options.validatorFactory?.() ?? new JavaScriptValidator({ behaviorOnly: true });
      const result = await validator.validate({
        ...context,
        rules: behaviorRules,
        files: {
          ...Object.fromEntries(Object.entries(files).filter(([file]) => !file.endsWith('.ts'))),
          ...compiled.files,
        },
        runtime: {
          ...runtime,
          kind: 'javascript',
          entryFile: runtime.entryFile.replace(/\.ts$/u, '.js'),
        },
      });
      if (
        learningRule?.success &&
        learningResult?.status === 'ready' &&
        (result.status === 'pass' || result.status === 'incomplete')
      ) {
        const rule = learningRule.data;
        const passed = Object.values(learningResult.facts).every(Boolean);
        const check = {
          ruleId: rule.id,
          requirementId: rule.id,
          label: rule.label,
          required: true,
          passed,
          requirementPassed: passed,
          message: passed
            ? '数値の型注釈と変数の使い方を確認できました。'
            : '今回の型注釈とscoreの使い方を確認しましょう。',
          expected: rule.feedback.expected,
          actual: passed
            ? '型注釈と正負の型検査を確認しました。'
            : '型注釈、型の確認を弱める書き方、最後の出力を確認してください。',
          nextAction: rule.feedback.nextAction,
          hintId: rule.hintId,
          relatedSlideId: rule.relatedSlideId,
        };
        return {
          ...result,
          status: passed && result.status === 'pass' ? 'pass' : 'incomplete',
          checks: [...result.checks, check],
          passedRequirementIds: [...result.passedRequirementIds, ...(passed ? [rule.id] : [])],
          diagnostics: result.diagnostics.flatMap((item) =>
            item.file?.endsWith('.js')
              ? mapTypeScriptDiagnostics([item], compiled.sourceMaps, input.files)
              : [item],
          ),
        };
      }
      return {
        ...result,
        diagnostics: result.diagnostics.flatMap((item) =>
          item.file?.endsWith('.js')
            ? mapTypeScriptDiagnostics([item], compiled.sourceMaps, input.files)
            : [item],
        ),
      };
    } catch {
      return blocked(context, 'TYPESCRIPT_VALIDATION_UNAVAILABLE');
    } finally {
      compiler?.dispose();
    }
  }
}
