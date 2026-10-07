import { acceptsReactHookScenarios } from '../../../core/content/reactHookInteractions';
import { acceptsReactReducerContextScenarios } from '../../../core/content/reactReducerContextInteractions';
import { acceptsReactFormScenarios } from '../../../core/content/reactFormInteractions';
import { acceptsReactStateScenarios } from '../../../core/content/reactStateInteractions';
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

/** 新Hook課題の検査結果を、その課題の操作へ結び付けて説明する。 */
function hookFeedback(
  goal: string | undefined,
  learned: boolean,
): { message: string; actual: string } | undefined {
  if (goal === 'ref-focus')
    return learned
      ? {
          message: 'Refから入力へのfocusと、Stateから表示へのつながりを確認できました。',
          actual: '指定入力のRef・Event・表示Stateを確認しました。',
        }
      : {
          message:
            '入力のrefを結び、null安全なfocusをEventから呼び、表示値はStateから導きましょう。',
          actual: '入力のRefとfocus、表示Stateへの経路を見直します。',
        };
  if (goal === 'external-sync' || goal === 'source-hook')
    return learned
      ? {
          message: '選んだ外部入力・Effectの依存値・同じ購読のcleanupを確認できました。',
          actual: '現在値・対象切替・解除・再mountへの経路を確認しました。',
        }
      : {
          message:
            'targetを依存値にし、受け取った値をStateへ渡し、同じ購読のcleanupを返しましょう。',
          actual: '外部入力とState、依存値、返すcleanupを見直します。',
        };
  return undefined;
}

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
      parsed.data.profile !== 'props-card-v1'
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
          if (!compiled.facts || !('reusesCardWithDistinctProps' in compiled.facts))
            return blocked();
          learned =
            compiled.facts.reusesCardWithDistinctProps &&
            compiled.facts.rendersAssignedPairs &&
            (parsed.data.learningGoal !== 'composition' || compiled.facts.rendersReceivedChildren);
        }
        if (parsed.data.profile === 'interactive-state-v1') {
          if (
            !compiled.facts ||
            !('usesState' in compiled.facts) ||
            !acceptsReactStateScenarios(parsed.data.learningGoal, context.interactionScenarios)
          )
            return blocked();
          learned =
            compiled.facts.usesState &&
            compiled.facts.updatesStateFromEvent &&
            (parsed.data.learningGoal === 'counter'
              ? compiled.facts.queuesTwoIncrements
              : compiled.facts.usesImmutableUpdates && compiled.facts.usesStableItemKeys);
        }
        if (parsed.data.profile === 'ref-focus-v1') {
          if (
            !compiled.facts ||
            !('usesInputRef' in compiled.facts) ||
            !acceptsReactHookScenarios(parsed.data.learningGoal, context.interactionScenarios)
          )
            return blocked();
          learned =
            compiled.facts.usesInputRef &&
            compiled.facts.focusesFromEvent &&
            compiled.facts.keepsStateForDisplay;
        }
        if (
          parsed.data.profile === 'effect-sync-v1' ||
          parsed.data.profile === 'custom-source-hook-v1'
        ) {
          if (
            !compiled.facts ||
            !('usesExternalEffect' in compiled.facts) ||
            !acceptsReactHookScenarios(parsed.data.learningGoal, context.interactionScenarios)
          )
            return blocked();
          learned =
            compiled.facts.usesExternalEffect &&
            compiled.facts.tracksSelectedSource &&
            compiled.facts.cleansSameSubscription &&
            compiled.facts.returnsReceivedValue &&
            compiled.facts.derivesDuringRender;
        }
        if (parsed.data.profile === 'reducer-form-v1') {
          if (
            !compiled.facts ||
            !('usesPureReducer' in compiled.facts) ||
            !acceptsReactReducerContextScenarios(
              parsed.data.learningGoal,
              context.interactionScenarios,
            )
          )
            return blocked();
          learned =
            compiled.facts.usesPureReducer &&
            compiled.facts.changesNameFromAction &&
            compiled.facts.submitsCurrentName &&
            compiled.facts.resetsInitialState &&
            compiled.facts.returnsFreshState;
        }
        if (parsed.data.profile === 'context-sharing-v1') {
          if (
            !compiled.facts ||
            !('readsSameProvidedValue' in compiled.facts) ||
            !acceptsReactReducerContextScenarios(
              parsed.data.learningGoal,
              context.interactionScenarios,
            )
          )
            return blocked();
          learned =
            compiled.facts.readsSameProvidedValue &&
            compiled.facts.forwardsProvidedUpdate &&
            compiled.facts.derivesFromProvidedValue;
        }
        if (parsed.data.profile === 'controlled-form-v1') {
          if (
            !compiled.facts ||
            !('usesSingleState' in compiled.facts) ||
            !acceptsReactFormScenarios(parsed.data.learningGoal, context.interactionScenarios)
          )
            return blocked();
          learned =
            compiled.facts.usesSingleState &&
            compiled.facts.usesControlledInput &&
            compiled.facts.derivesFromSameState &&
            (parsed.data.learningGoal === 'controlled-form'
              ? compiled.facts.preventsSubmit
              : compiled.facts.sharesParentState);
        }
        files = prepareReactModules(compiled.files, parsed.data.profile);
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
          capabilityProfile: ['controlled-form-v1', 'reducer-form-v1'].includes(parsed.data.profile)
            ? 'dom-form'
            : 'dom',
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
        const specialized = hookFeedback(parsed.data.learningGoal, learned);
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
              message:
                specialized?.message ??
                (learned
                  ? parsed.data.profile === 'reducer-form-v1'
                    ? '3つのactionから純粋な次Stateへのつながりを確認できました。'
                    : parsed.data.profile === 'context-sharing-v1'
                      ? '同じProviderから2consumerへの値と更新経路を確認できました。'
                      : parsed.data.profile === 'controlled-form-v1'
                        ? '入力から同じ親Stateと派生表示へのつながりを確認できました。'
                        : parsed.data.profile === 'interactive-state-v1'
                          ? 'Stateの更新と表示へのつながりを確認できました。'
                          : '受け取ったPropsから表示へのつながりを確認できました。'
                  : parsed.data.profile === 'reducer-form-v1'
                    ? '入力actionの新しい名前、送信時の現在の名前、やり直しの初期値から新しいStateを返しましょう。'
                    : parsed.data.profile === 'context-sharing-v1'
                      ? '同じContextの値と親callbackを入力欄・要約・文字数へつなげましょう。'
                      : parsed.data.profile === 'controlled-form-v1'
                        ? parsed.data.learningGoal === 'controlled-form'
                          ? '入力値を1つのStateへ更新し、表示・文字数を導き、送信を明示的に取り消しましょう。'
                          : '共通の親Stateを兄弟へ渡し、入力から親の更新callbackと子の要約・文字数へつなげましょう。'
                        : parsed.data.profile === 'interactive-state-v1'
                          ? parsed.data.learningGoal === 'counter'
                            ? '「2増やす」では、前の値から1増やす純粋updaterを同じhandler内で2回渡しましょう。'
                            : 'EventからStateを新しい配列へ更新し、項目の安定したIDをKeyにしましょう。'
                          : '固定表示で済ませず、受け取ったPropsとchildrenから表示へつなげましょう。'),
              expected: rule.feedback.expected,
              actual:
                specialized?.actual ??
                (parsed.data.profile === 'reducer-form-v1'
                  ? learned
                    ? '3actionの値の由来と純粋な更新を確認しました。'
                    : 'Reducerの3actionと新しいStateの返却を見直します。'
                  : parsed.data.profile === 'context-sharing-v1'
                    ? learned
                      ? '同Providerの値とcallbackから2consumerへの接続を確認しました。'
                      : 'Contextの取得元と入力・派生表示への接続を見直します。'
                    : parsed.data.profile === 'controlled-form-v1'
                      ? learned
                        ? '入力・親State・表示のつながりを確認しました。'
                        : '共通の親Stateと入力・派生表示への経路を見直します。'
                      : parsed.data.profile === 'interactive-state-v1'
                        ? learned
                          ? 'Stateの更新と表示のつながりを確認しました。'
                          : parsed.data.learningGoal === 'counter'
                            ? '同じStateの表示と、1操作内のupdater2回を見直します。'
                            : '新配列への更新と、描画項目のID由来のKeyを見直します。'
                        : learned
                          ? 'Propsと表示のつながりを確認しました。'
                          : 'Componentの再利用・渡す値・childrenの表示を見直します。'),
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
