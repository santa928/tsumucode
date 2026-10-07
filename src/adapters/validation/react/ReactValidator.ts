import {
  ReactExerciseRuntimeSchema,
  ReactLearningRuleDefinitionSchema,
} from '../../../core/content/schema';
import type { SnapshotPolicy } from '../../../core/runtime/contracts';
import type {
  ValidationContext,
  ValidationResult,
  ValidatorAdapter,
  ValidatorRule,
} from '../../../core/validation/contracts';
import { createReactCompilerClient } from '../../runtime/react/ReactCompilerClient';
import { prepareReactModules, ReactModuleAnalyzer } from '../../runtime/react/ReactModuleAnalyzer';
import { reactSourceHash } from '../../runtime/react/reactSourceHash';
import { isReactWorkspace } from '../../runtime/react/reactWorkspace';
import { JavaScriptValidator } from '../javascript/JavaScriptValidator';

/** 同世代の型検査済みTSXと実DOMだけを採点し、型成功だけで合格にしない。 */
export class ReactValidator implements ValidatorAdapter {
  buildSnapshotPolicy(rules: readonly ValidatorRule[]): SnapshotPolicy {
    return new JavaScriptValidator({ behaviorOnly: true }).buildSnapshotPolicy(
      rules.filter(
        (rule) => rule.target.kind !== 'react-learning' && rule.assertion.kind !== 'react-learning',
      ),
    );
  }

  async validate(context: ValidationContext): Promise<ValidationResult> {
    const parsed = ReactExerciseRuntimeSchema.safeParse(context.runtime);
    const execution = context.execution;
    const blocked = (): ValidationResult => ({
      exerciseId: context.exerciseId,
      executionRevision: execution?.executionRevision ?? null,
      status: 'system-error',
      checks: [],
      passedRequirementIds: [],
      evaluatedAt: context.now,
      diagnostics: [
        ...context.diagnostics,
        {
          code: 'react-source-mismatch',
          kind: 'system',
          severity: 'error',
          message: 'React source identity mismatch',
          learnerMessage:
            '型を確認したコードと描画結果が一致しません。コードを保持して、もう一度実行してください。',
        },
      ],
    });
    // 型・描画の失敗時には成功証拠がない。既存の診断分類だけを評価する。
    if (
      !parsed.success ||
      !execution ||
      execution.backend !== 'browser' ||
      !isReactWorkspace(context.files, parsed.data.profile)
    )
      return blocked();
    const learningRules = context.rules.filter(
      (rule) => rule.target.kind === 'react-learning' || rule.assertion.kind === 'react-learning',
    );
    const learningRule = ReactLearningRuleDefinitionSchema.safeParse(learningRules[0]);
    if (
      parsed.data.profile === 'static-components-v1'
        ? learningRules.length !== 1 ||
          !learningRule.success ||
          learningRule.data.assertion.goal !== parsed.data.learningGoal
        : learningRules.length !== 0
    )
      return blocked();
    const behaviorRules = context.rules.filter((rule) => !learningRules.includes(rule));
    let learned: boolean | undefined;
    const sourceEvidence = context.evidence.filter((item) => item.id === 'react.source-sha256');
    if (!context.diagnostics.some((item) => item.severity === 'error')) {
      if (
        execution.status !== 'succeeded' ||
        sourceEvidence.length !== 1 ||
        sourceEvidence[0]?.value !==
          (await reactSourceHash(
            context.files,
            parsed.data,
            execution.exerciseSessionId,
            execution.executionRevision,
          ))
      )
        return blocked();
    }
    let files = context.files;
    const compiler = createReactCompilerClient();
    try {
      if (!context.diagnostics.some((item) => item.severity === 'error')) {
        const compiled = await compiler.compile({
          sessionId: execution.exerciseSessionId,
          revision: execution.executionRevision,
          profile: parsed.data.profile,
          files: Object.fromEntries(
            Object.entries(context.files).filter(([file]) => /\.tsx?$/u.test(file)),
          ),
        });
        if (compiled.status !== 'ready') return blocked();
        if (parsed.data.profile === 'static-components-v1') {
          if (!compiled.facts) return blocked();
          learned =
            compiled.facts.reusesCardWithDistinctProps &&
            compiled.facts.rendersAssignedPairs &&
            (parsed.data.learningGoal !== 'composition' || compiled.facts.rendersReceivedChildren);
        }
        files = prepareReactModules(compiled.files);
      }
      const result = await new JavaScriptValidator({
        behaviorOnly: true,
        analyzerFactory: () => new ReactModuleAnalyzer(),
      }).validate({
        ...context,
        files,
        rules: behaviorRules,
        runtime: {
          kind: 'javascript',
          entryFile: 'main.js',
          sourceType: 'module',
          capabilityProfile: 'dom',
          primaryOutput: 'preview',
        },
        evidence: context.evidence.filter((item) => item.id !== 'react.source-sha256'),
      });
      if (
        learned !== undefined &&
        learningRule.success &&
        (result.status === 'pass' || result.status === 'incomplete')
      ) {
        const rule = learningRule.data;
        return {
          ...result,
          status: learned && result.status === 'pass' ? 'pass' : 'incomplete',
          checks: [
            ...result.checks,
            {
              ruleId: rule.id,
              requirementId: rule.id,
              label: rule.label,
              required: true,
              passed: learned,
              requirementPassed: learned,
              message: learned
                ? '受け取ったPropsから表示へのつながりを確認できました。'
                : '固定表示で済ませず、受け取ったPropsとchildrenから表示へつなげましょう。',
              expected: rule.feedback.expected,
              actual: learned
                ? 'Propsと表示のつながりを確認しました。'
                : 'Componentの再利用・渡す値・childrenの表示を見直します。',
              nextAction: rule.feedback.nextAction,
              hintId: rule.hintId,
              relatedSlideId: rule.relatedSlideId,
            },
          ],
          passedRequirementIds: [...result.passedRequirementIds, ...(learned ? [rule.id] : [])],
        };
      }
      return result;
    } catch {
      return blocked();
    } finally {
      compiler.dispose();
    }
  }
}
