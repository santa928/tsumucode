import {
  TypeScriptQuizProjectContracts,
  acceptsTypeScriptQuizProjectRuntime,
  acceptsTypeScriptQuizProjectScenarios,
  type TypeScriptQuizProjectProfile,
} from '../../../core/content/typeScriptQuizProjectContract';
import type { QuizProjectResult } from '../../runtime/typescript/checkQuizProject';
import { isQuizProjectResult } from '../../runtime/typescript/workerContract';
import {
  TypeScriptBoundaryContracts,
  acceptsTypeScriptBoundaryScenarios,
  acceptsTypeScriptBoundaryRuntime,
  type TypeScriptBoundaryProfile,
} from '../../../core/content/typeScriptBoundaryContract';
import type { BoundaryLearningResult } from '../../runtime/typescript/checkBoundaryLearning';
import {
  TypeScriptExerciseRuntimeSchema,
  TypeScriptLearningRuleDefinitionSchema,
  TypeScriptLearningContracts,
} from '../../../core/content/schema';
import type { ScoreNumberAnnotationResult } from '../../runtime/typescript/checkScoreNumberAnnotation';
import type { ScoreNumberInferenceResult } from '../../runtime/typescript/checkScoreNumberInference';
import type { QuestionInterfaceResult } from '../../runtime/typescript/checkQuestionInterface';
import type {
  ReusableLearningProfile,
  ReusableLearningResult,
} from '../../runtime/typescript/checkReusableLearning';
import type {
  ConditionalLearningProfile,
  ConditionalLearningResult,
} from '../../runtime/typescript/checkConditionalLearning';
import {
  isScoreNumberAnnotationResult,
  isScoreNumberInferenceResult,
  isQuestionInterfaceResult,
  isConditionalLearningResult,
  isReusableLearningResult,
  isBoundaryLearningResult,
} from '../../runtime/typescript/workerContract';
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
  quizProjectCheck?(
    input: TypeScriptCompileInput,
    profile: TypeScriptQuizProjectProfile,
  ): Promise<QuizProjectResult>;
  boundaryCheck?(
    input: TypeScriptCompileInput,
    profile: TypeScriptBoundaryProfile,
  ): Promise<BoundaryLearningResult>;
  compile(input: TypeScriptCompileInput): Promise<TypeScriptCompileResult>;
  learningCheck?(input: TypeScriptCompileInput): Promise<ScoreNumberAnnotationResult>;
  inferenceCheck?(input: TypeScriptCompileInput): Promise<ScoreNumberInferenceResult>;
  questionCheck?(input: TypeScriptCompileInput): Promise<QuestionInterfaceResult>;
  reusableCheck?(
    input: TypeScriptCompileInput,
    profile: ReusableLearningProfile,
  ): Promise<ReusableLearningResult>;
  conditionalCheck?(
    input: TypeScriptCompileInput,
    profile: ConditionalLearningProfile,
  ): Promise<ConditionalLearningResult>;
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
    const learningContract = TypeScriptLearningContracts.find(
      (contract) => context.exerciseId === `${contract.lessonId}-e01`,
    );
    const boundaryContract = TypeScriptBoundaryContracts.find(
      (contract) => context.exerciseId === `${contract.lessonId}-e01`,
    );
    const quizContract = TypeScriptQuizProjectContracts.find(
      (contract) => context.exerciseId === `${contract.lessonId}-e01`,
    );
    const quizProfile = quizContract?.profile;
    if (
      quizProfile &&
      (!acceptsTypeScriptQuizProjectRuntime(context.runtime) ||
        !acceptsTypeScriptQuizProjectScenarios(quizProfile, context.interactionScenarios))
    )
      return blocked(context, 'TYPESCRIPT_QUIZ_PROJECT_CONTRACT');
    const boundaryProfile = boundaryContract?.profile;
    if (
      boundaryProfile &&
      (!acceptsTypeScriptBoundaryScenarios(boundaryProfile, context.interactionScenarios) ||
        !acceptsTypeScriptBoundaryRuntime(boundaryProfile, context.runtime))
    )
      return blocked(context, 'TYPESCRIPT_BOUNDARY_CONTRACT');
    const inferenceLesson = context.exerciseId === 'typescript-ch01-l01-e01';
    const questionLesson = context.exerciseId === 'typescript-ch02-l01-e01';
    const conditionalProfile =
      context.exerciseId === 'typescript-ch03-l01-e01'
        ? 'union-result-v1'
        : context.exerciseId === 'typescript-ch03-l02-e01'
          ? 'optional-hint-v1'
          : undefined;
    const reusableProfile: ReusableLearningProfile | undefined =
      context.exerciseId === 'typescript-ch04-l01-e01'
        ? 'number-callback-v1'
        : context.exerciseId === 'typescript-ch04-l02-e01'
          ? 'generic-identity-v1'
          : context.exerciseId === 'typescript-ch04-l03-e01'
            ? 'readonly-copy-v1'
            : undefined;
    if (
      (learningRules.length > 0 || learningContract) &&
      (learningRules.length !== 1 ||
        !learningRule?.success ||
        !learningContract ||
        learningRule.data.assertion.profile !== learningContract.profile ||
        context.rules.some(
          (rule) =>
            rule !== learningRules[0] &&
            (rule.id === learningRules[0]!.id || rule.groupId === learningRules[0]!.id),
        ) ||
        consoleRules.length !== 1 ||
        !learningContract.consoleRuleSchema.safeParse(consoleRules[0]).success)
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
      let learningResult:
        | ScoreNumberAnnotationResult
        | ScoreNumberInferenceResult
        | QuestionInterfaceResult
        | ConditionalLearningResult
        | ReusableLearningResult
        | BoundaryLearningResult
        | QuizProjectResult
        | undefined;
      if (learningRule?.success) {
        learningResult = quizProfile
          ? await compiler.quizProjectCheck?.(input, quizProfile)
          : boundaryProfile
            ? await compiler.boundaryCheck?.(input, boundaryProfile)
            : reusableProfile
              ? await compiler.reusableCheck?.(input, reusableProfile)
              : conditionalProfile
                ? await compiler.conditionalCheck?.(input, conditionalProfile)
                : questionLesson
                  ? await compiler.questionCheck?.(input)
                  : inferenceLesson
                    ? await compiler.inferenceCheck?.(input)
                    : await compiler.learningCheck?.(input);
        const isLearningResult = quizProfile
          ? (value: unknown): value is QuizProjectResult => isQuizProjectResult(value, quizProfile)
          : boundaryProfile
            ? (value: unknown): value is BoundaryLearningResult =>
                isBoundaryLearningResult(value, boundaryProfile)
            : reusableProfile
              ? (value: unknown): value is ReusableLearningResult =>
                  isReusableLearningResult(value, reusableProfile)
              : conditionalProfile
                ? (value: unknown): value is ConditionalLearningResult =>
                    isConditionalLearningResult(value, conditionalProfile)
                : questionLesson
                  ? isQuestionInterfaceResult
                  : inferenceLesson
                    ? isScoreNumberInferenceResult
                    : isScoreNumberAnnotationResult;
        if (!isLearningResult(learningResult) || learningResult.status !== 'ready')
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
        const learningGoal =
          quizProfile === 'quiz-data-v1'
            ? 'クイズのデータ型'
            : quizProfile === 'quiz-state-v1'
              ? '回答と状態更新'
              : quizProfile === 'quiz-boundary-v1'
                ? 'クイズのunknownと非同期境界'
                : boundaryProfile === 'dom-event-v1'
                  ? 'EventとDOMの対象確認'
                  : boundaryProfile === 'unknown-points-v1'
                    ? 'unknownの実検証'
                    : boundaryProfile === 'async-unknown-v1'
                      ? '非同期のunknownと失敗処理'
                      : reusableProfile === 'number-callback-v1'
                        ? '関数とcallbackの型'
                        : reusableProfile === 'generic-identity-v1'
                          ? 'genericの入出力関係'
                          : reusableProfile === 'readonly-copy-v1'
                            ? 'readonlyの入力と別の配列'
                            : conditionalProfile === 'union-result-v1'
                              ? 'unionの絞り込み'
                              : conditionalProfile === 'optional-hint-v1'
                                ? 'optional値の確認'
                                : questionLesson
                                  ? 'interface'
                                  : inferenceLesson
                                    ? '型推論'
                                    : '型注釈';
        const check = {
          ruleId: rule.id,
          requirementId: rule.id,
          label: rule.label,
          required: true,
          passed,
          requirementPassed: passed,
          message:
            boundaryProfile || quizProfile
              ? passed
                ? `${learningGoal}と、受け取った値から表示へ届く処理を確認できました。`
                : `${learningGoal}と、確認した値を使う処理を見直しましょう。`
              : reusableProfile
                ? passed
                  ? `${learningGoal}と引数の値を使う処理を確認できました。`
                  : `${learningGoal}を保ち、引数から結果を作る処理を確認しましょう。`
                : conditionalProfile
                  ? passed
                    ? `${learningGoal}と分岐で読む値を確認できました。`
                    : `${learningGoal}と、引数から値を取り出す分岐を確認しましょう。`
                  : questionLesson
                    ? passed
                      ? 'interfaceの必須項目・型と選択肢の使い方を確認できました。'
                      : '問題の形と値を保ち、interfaceの注釈と選択肢の表示を確認しましょう。'
                    : passed
                      ? `数値の${learningGoal}と変数の使い方を確認できました。`
                      : `今回の${learningGoal}とscoreの使い方を確認しましょう。`,
          expected: rule.feedback.expected,
          actual:
            boundaryProfile || quizProfile
              ? passed
                ? `${learningGoal}と正負の型検査を確認しました。`
                : '型の契約、値の確認と操作から表示への接続を確認してください。'
              : reusableProfile
                ? passed
                  ? '型の契約と正負の型検査を確認しました。'
                  : '型の契約・型の確認を弱める書き方・引数を使う処理を確認してください。'
                : conditionalProfile
                  ? passed
                    ? '分岐で読む値と形の正負検査を確認しました。'
                    : '型の形、引数の注釈、分岐で読む値、実行例を確認してください。'
                  : questionLesson
                    ? passed
                      ? 'interfaceの注釈と形の正負検査を確認しました。'
                      : '必須項目の型、問題の値、注釈、最後の選択肢の表示を確認してください。'
                    : passed
                      ? `${learningGoal}と正負の型検査を確認しました。`
                      : `${learningGoal}、型の確認を弱める書き方、最後の出力を確認してください。`,
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
