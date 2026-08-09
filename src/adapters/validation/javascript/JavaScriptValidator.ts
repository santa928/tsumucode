import type {
  HtmlCssValidationRuleDefinition,
  JavaScriptCheckpointExpectation,
  JavaScriptInteractionScenario,
  JavaScriptValidationRuleDefinition,
} from '../../../core/content/types';
import type {
  PreviewSnapshot,
  RunnerDiagnostic,
  RunnerEvidence,
  SnapshotPolicy,
} from '../../../core/runtime/contracts';
import type {
  ValidationCheck,
  ValidationContext,
  ValidationResult,
  ValidatorAdapter,
  ValidatorRule,
} from '../../../core/validation/contracts';
import { ValidatorRuleEngine } from '../../../core/validation/validatorRuleEngine';
import { JavaScriptAnalyzerClient } from '../../runtime/javascript/analyzer/JavaScriptAnalyzerClient';
import type {
  JavaScriptAnalysisInput,
  JavaScriptAnalysisResult,
  JavaScriptAnalysisSuccess,
} from '../../runtime/javascript/analyzer/contracts';
import {
  buildJavaScriptSnapshotPolicy,
  parseJavaScriptRules,
  type JavaScriptValidatorRule,
} from './ruleSchema';

interface JavaScriptAnalyzerPort {
  analyze(input: JavaScriptAnalysisInput): Promise<JavaScriptAnalysisResult>;
  dispose(): Promise<void>;
}

export interface JavaScriptValidatorOptions {
  readonly analyzerFactory?: () => JavaScriptAnalyzerPort;
  readonly guardIdentifierFactory?: () => string;
}

interface SnapshotIdentity {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
}

interface RequirementEvaluation {
  readonly id: string;
  readonly required: boolean;
  readonly passed: boolean;
}

interface InteractionObservation {
  readonly viewportId: string;
  readonly passed: boolean;
  readonly actual: string;
}

const SOURCE_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const GUARD_IDENTIFIER_PATTERN = /^[$A-Z_a-z][$\w]*$/u;

/** 学習者の不正解と混ぜないValidator基盤診断を作る。 */
function systemDiagnostic(code: string, message: string): RunnerDiagnostic {
  return {
    code,
    kind: 'system',
    severity: 'error',
    message,
    learnerMessage:
      '判定用のJavaScript実行結果を確認できませんでした。コードは保存されています。もう一度実行してください。',
  };
}

/** 評価不能な入力をcheckなしの決定的なResultへ変換する。 */
function blockedResult(
  context: ValidationContext,
  status: 'code-error' | 'system-error',
  diagnostics: readonly RunnerDiagnostic[],
  executionRevision: number | null = null,
): ValidationResult {
  return {
    exerciseId: context.exerciseId,
    executionRevision,
    status,
    checks: [],
    passedRequirementIds: [],
    diagnostics: [...diagnostics],
    evaluatedAt: context.now,
  };
}

/** Ruleが参照する全Snapshotを同一session／revisionへ限定する。 */
function snapshotIdentity(
  rules: readonly JavaScriptValidatorRule[],
  snapshots: Readonly<Record<string, PreviewSnapshot>>,
): SnapshotIdentity | RunnerDiagnostic {
  const viewportIds = new Set(rules.flatMap(({ viewportIds: ids }) => ids));
  let identity: SnapshotIdentity | undefined;
  for (const viewportId of viewportIds) {
    const snapshot = snapshots[viewportId];
    if (snapshot === undefined) {
      return systemDiagnostic(
        'JAVASCRIPT_SNAPSHOT_MISSING',
        `JavaScript validation snapshot is missing: ${viewportId}`,
      );
    }
    if (snapshot.viewport.id !== viewportId) {
      return systemDiagnostic(
        'JAVASCRIPT_SNAPSHOT_KEY_MISMATCH',
        `Snapshot key ${viewportId} does not match ${snapshot.viewport.id}`,
      );
    }
    identity ??= {
      exerciseSessionId: snapshot.exerciseSessionId,
      executionRevision: snapshot.executionRevision,
    };
    if (
      snapshot.exerciseSessionId !== identity.exerciseSessionId ||
      snapshot.executionRevision !== identity.executionRevision
    ) {
      return systemDiagnostic(
        'JAVASCRIPT_SNAPSHOT_IDENTITY_MISMATCH',
        `JavaScript snapshot identity differs: ${viewportId}`,
      );
    }
  }
  return (
    identity ??
    systemDiagnostic('JAVASCRIPT_SNAPSHOT_MISSING', 'JavaScript validation has no snapshot')
  );
}

/** EvidenceをIDと任意Fileの一意なkeyへ索引化する。 */
function evidenceIndex(
  evidence: readonly RunnerEvidence[],
): ReadonlyMap<string, RunnerEvidence> | RunnerDiagnostic {
  const index = new Map<string, RunnerEvidence>();
  for (const item of evidence) {
    const key = JSON.stringify([item.id, item.file ?? null]);
    if (index.has(key)) {
      return systemDiagnostic(
        'JAVASCRIPT_EVIDENCE_DUPLICATED',
        `JavaScript evidence is duplicated: ${item.id}`,
      );
    }
    index.set(key, item);
  }
  return index;
}

/** 必須の実行証拠が成功状態か確認する。 */
function executionEvidenceDiagnostic(
  index: ReadonlyMap<string, RunnerEvidence>,
): RunnerDiagnostic | undefined {
  const executed = index.get(JSON.stringify(['javascript.executed', null]));
  const budget = index.get(JSON.stringify(['javascript.budget-exhausted', null]));
  if (executed?.value !== true) {
    return systemDiagnostic(
      'JAVASCRIPT_EXECUTION_EVIDENCE_INVALID',
      'javascript.executed evidence is missing or false',
    );
  }
  if (budget?.value !== false) {
    return systemDiagnostic(
      'JAVASCRIPT_BUDGET_EVIDENCE_INVALID',
      'javascript.budget-exhausted evidence is missing or true',
    );
  }
  return undefined;
}

/** Scenario定義とviewport別checkpoint結果を同一実行へfail-closedに照合する。 */
function interactionResultDiagnostic(
  scenarios: readonly JavaScriptInteractionScenario[],
  checkpointsByViewport: ValidationContext['interactionCheckpoints'],
  identity: SnapshotIdentity,
  viewportIds: readonly string[],
): RunnerDiagnostic | undefined {
  const expectedCheckpoints = new Map<
    string,
    JavaScriptInteractionScenario['checkpoints'][number]
  >();
  for (const scenario of scenarios) {
    for (const checkpoint of scenario.checkpoints) {
      expectedCheckpoints.set(`${scenario.id}\u0000${checkpoint.id}`, checkpoint);
    }
  }
  const actualViewportIds = Object.keys(checkpointsByViewport);
  if (scenarios.length === 0) {
    if (
      actualViewportIds.some((viewportId) => (checkpointsByViewport[viewportId]?.length ?? 0) > 0)
    ) {
      return systemDiagnostic(
        'JAVASCRIPT_INTERACTION_RESULT_INVALID',
        'Interaction ScenarioがないExerciseへcheckpoint結果が渡されました',
      );
    }
    return undefined;
  }
  if (
    actualViewportIds.length !== viewportIds.length ||
    actualViewportIds.some((viewportId) => !viewportIds.includes(viewportId))
  ) {
    return systemDiagnostic(
      'JAVASCRIPT_INTERACTION_RESULT_INVALID',
      'Interaction checkpointのviewport集合がSnapshotと一致しません',
    );
  }
  for (const viewportId of viewportIds) {
    const results = checkpointsByViewport[viewportId];
    if (results === undefined || results.length !== expectedCheckpoints.size) {
      return systemDiagnostic(
        'JAVASCRIPT_INTERACTION_RESULT_INVALID',
        `Interaction checkpointが不足または過剰です: ${viewportId}`,
      );
    }
    const seen = new Set<string>();
    for (const result of results) {
      const key = `${result.scenarioId}\u0000${result.checkpointId}`;
      if (seen.has(key)) {
        return systemDiagnostic(
          'JAVASCRIPT_INTERACTION_RESULT_INVALID',
          `Interaction checkpointが重複しています: ${viewportId}/${result.scenarioId}/${result.checkpointId}`,
        );
      }
      seen.add(key);
      const expected = expectedCheckpoints.get(key);
      if (
        expected === undefined ||
        result.viewportId !== viewportId ||
        result.exerciseSessionId !== identity.exerciseSessionId ||
        result.executionRevision !== identity.executionRevision ||
        !Number.isSafeInteger(result.frameGeneration) ||
        result.frameGeneration < 0 ||
        result.afterActionId !== expected.afterActionId
      ) {
        return systemDiagnostic(
          'JAVASCRIPT_INTERACTION_RESULT_INVALID',
          `Interaction checkpoint identityが一致しません: ${viewportId}/${result.scenarioId}/${result.checkpointId}`,
        );
      }
      const expectationIds = result.expectations.map(({ expectationId }) => expectationId);
      const expectedIds = new Set(expected.expectations.map(({ id }) => id));
      if (
        expectationIds.length !== expectedIds.size ||
        new Set(expectationIds).size !== expectationIds.length ||
        expectationIds.some((expectationId) => !expectedIds.has(expectationId))
      ) {
        return systemDiagnostic(
          'JAVASCRIPT_INTERACTION_RESULT_INVALID',
          `Interaction expectationが不足、未知、または重複しています: ${viewportId}/${result.scenarioId}/${result.checkpointId}`,
        );
      }
    }
  }
  return undefined;
}

/** Analyzer失敗診断をcode／systemの優先順位でResultへ変換する。 */
function analysisFailureResult(
  context: ValidationContext,
  result: Exclude<JavaScriptAnalysisResult, JavaScriptAnalysisSuccess>,
  executionRevision: number,
): ValidationResult {
  const status = result.diagnostics.some(
    ({ kind, severity }) => kind === 'system' && severity === 'error',
  )
    ? 'system-error'
    : 'code-error';
  return blockedResult(
    context,
    status,
    [...context.diagnostics, ...result.diagnostics],
    status === 'code-error' ? executionRevision : null,
  );
}

/** Source RuleをAnalyzer Factへ照合して説明可能なcheckを返す。 */
function sourceCheck(
  rule: JavaScriptValidationRuleDefinition,
  analysis: JavaScriptAnalysisSuccess,
): ValidationCheck {
  const fact = analysis.facts.find(
    (candidate) =>
      candidate.kind === 'query-selector-text-content-assignment' &&
      candidate.file === rule.target.file &&
      candidate.selector === rule.assertion.selector &&
      candidate.value === rule.assertion.expected,
  );
  const requirementId = rule.groupId ?? rule.id;
  const passed = fact !== undefined;
  return {
    ruleId: rule.id,
    requirementId,
    label: rule.label,
    required: rule.required,
    passed,
    requirementPassed: passed,
    message: passed
      ? `${rule.label}：条件を満たしています`
      : `${rule.feedback.target}を確認してください`,
    expected: rule.feedback.expected,
    actual:
      fact === undefined
        ? `${rule.target.file}: 指定した代入式なし`
        : `${fact.file}:${String(fact.line)}:${String(fact.column)}`,
    nextAction: rule.feedback.nextAction,
    hintId: rule.hintId,
    relatedSlideId: rule.relatedSlideId,
  };
}

/** Rule順のcheckをRequirementのall／anyへ集約する。 */
function aggregateRequirements(
  rules: readonly JavaScriptValidatorRule[],
  checks: readonly ValidationCheck[],
): readonly RequirementEvaluation[] {
  const checksByRule = new Map(checks.map((check) => [check.ruleId, check]));
  const grouped = new Map<string, JavaScriptValidatorRule[]>();
  for (const rule of rules) {
    const requirementId = rule.groupId ?? rule.id;
    const members = grouped.get(requirementId) ?? [];
    members.push(rule);
    grouped.set(requirementId, members);
  }
  return [...grouped].map(([id, members]) => ({
    id,
    required: members[0]!.required,
    passed:
      members[0]!.group === 'all'
        ? members.every((rule) => checksByRule.get(rule.id)?.passed === true)
        : members.some((rule) => checksByRule.get(rule.id)?.passed === true),
  }));
}

/** Scenario expectationを初心者が比較できる期待値の文章へ変換する。 */
function interactionExpected(expectation: JavaScriptCheckpointExpectation): string {
  switch (expectation.kind) {
    case 'selector-exists':
      return `${expectation.selector} が表示される`;
    case 'selector-text':
      return `${expectation.selector} の文章が「${expectation.equals}」になる`;
    case 'attribute':
      return `${expectation.selector} の ${expectation.name} 属性が「${expectation.equals}」になる`;
    case 'focused':
      return `${expectation.selector} にフォーカスが移る`;
    case 'console-includes':
      return `Consoleに「${expectation.includes}」が含まれる`;
  }
}

/** 公開Scenario順に全viewportの観測をANDした説明可能なcheckを返す。 */
function interactionChecks(
  scenarios: readonly JavaScriptInteractionScenario[],
  checkpointsByViewport: ValidationContext['interactionCheckpoints'],
  viewportIds: readonly string[],
): readonly ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  for (const scenario of scenarios) {
    for (const checkpoint of scenario.checkpoints) {
      const requirementId = `interaction:${scenario.id}:${checkpoint.id}`;
      for (const expectation of checkpoint.expectations) {
        const observations: InteractionObservation[] = viewportIds.map((viewportId) => {
          const result = checkpointsByViewport[viewportId]?.find(
            (candidate) =>
              candidate.scenarioId === scenario.id && candidate.checkpointId === checkpoint.id,
          );
          const observed = result?.expectations.find(
            (candidate) => candidate.expectationId === expectation.id,
          );
          return {
            viewportId,
            passed: observed?.passed === true,
            actual: observed?.actual ?? '観測結果なし',
          };
        });
        const passed = observations.every(({ passed: viewportPassed }) => viewportPassed);
        const actual =
          observations.length === 1
            ? observations[0]!.actual
            : observations
                .map(({ viewportId, actual: value }) => `${viewportId}: ${value}`)
                .join(' / ');
        const expected = interactionExpected(expectation);
        checks.push({
          ruleId: `${requirementId}:${expectation.id}`,
          requirementId,
          label: `${scenario.label}：${checkpoint.id}`,
          required: true,
          passed,
          requirementPassed: false,
          message: passed
            ? `${scenario.label}：条件を満たしています`
            : `${checkpoint.id}で${expected}か確認してください`,
          expected,
          actual,
          nextAction: passed
            ? '次の手順へ進む'
            : `「${scenario.label}」をもう一度実行して、${expected}か確認する`,
        });
      }
    }
  }
  const passedByRequirement = new Map<string, boolean>();
  for (const check of checks) {
    passedByRequirement.set(
      check.requirementId,
      (passedByRequirement.get(check.requirementId) ?? true) && check.passed,
    );
  }
  return checks.map((check) => ({
    ...check,
    requirementPassed: passedByRequirement.get(check.requirementId) === true,
  }));
}

/** JavaScript Source・実行証拠・DOMを同一revisionでAND評価するValidator。 */
export class JavaScriptValidator implements ValidatorAdapter {
  readonly #analyzerFactory: () => JavaScriptAnalyzerPort;
  readonly #guardIdentifierFactory: () => string;
  readonly #domEngine = new ValidatorRuleEngine();

  constructor(options: JavaScriptValidatorOptions = {}) {
    this.#analyzerFactory = options.analyzerFactory ?? (() => new JavaScriptAnalyzerClient());
    this.#guardIdentifierFactory =
      options.guardIdentifierFactory ??
      (() => `_tsumucodeValidation_${crypto.randomUUID().replaceAll('-', '_')}`);
  }

  /** strict RuleからSnapshot Bridgeへ要求するDOM観測条件だけを導出する。 */
  buildSnapshotPolicy(rules: readonly ValidatorRule[]): SnapshotPolicy {
    return buildJavaScriptSnapshotPolicy(parseJavaScriptRules(rules));
  }

  /** system/code境界を先に確定し、Source・Evidence・DOMを同じ評価時点へ結合する。 */
  async validate(context: ValidationContext): Promise<ValidationResult> {
    let rules: readonly JavaScriptValidatorRule[];
    try {
      rules = parseJavaScriptRules(context.rules);
    } catch (error: unknown) {
      return blockedResult(context, 'system-error', [
        ...context.diagnostics,
        systemDiagnostic(
          'JAVASCRIPT_RULE_INVALID',
          error instanceof Error ? error.message : String(error),
        ),
      ]);
    }

    const runtime = context.runtime;
    if (runtime?.kind !== 'javascript') {
      return blockedResult(context, 'system-error', [
        ...context.diagnostics,
        systemDiagnostic(
          'JAVASCRIPT_RUNTIME_INVALID',
          'JavaScript validation requires a JavaScript runtime contract',
        ),
      ]);
    }

    const hasSystemError = context.diagnostics.some(
      ({ kind, severity }) => kind === 'system' && severity === 'error',
    );
    if (hasSystemError) return blockedResult(context, 'system-error', context.diagnostics);
    const hasCodeError = context.diagnostics.some(
      ({ kind, severity }) => kind !== 'system' && severity === 'error',
    );
    const identity = snapshotIdentity(rules, context.snapshots);
    if (hasCodeError) {
      return blockedResult(
        context,
        'code-error',
        context.diagnostics,
        'kind' in identity ? null : identity.executionRevision,
      );
    }
    if ('kind' in identity) {
      return blockedResult(context, 'system-error', [...context.diagnostics, identity]);
    }
    const indexedEvidence = evidenceIndex(context.evidence);
    if ('kind' in indexedEvidence) {
      return blockedResult(context, 'system-error', [...context.diagnostics, indexedEvidence]);
    }
    const executionEvidenceError = executionEvidenceDiagnostic(indexedEvidence);
    if (executionEvidenceError !== undefined) {
      return blockedResult(context, 'system-error', [
        ...context.diagnostics,
        executionEvidenceError,
      ]);
    }
    const interactionResultError = interactionResultDiagnostic(
      context.interactionScenarios,
      context.interactionCheckpoints,
      identity,
      Object.keys(context.snapshots),
    );
    if (interactionResultError !== undefined) {
      return blockedResult(context, 'system-error', [
        ...context.diagnostics,
        interactionResultError,
      ]);
    }

    const sourceRules = rules.filter(
      (rule): rule is JavaScriptValidationRuleDefinition =>
        rule.target.kind === 'javascript-source',
    );
    const domRules = rules.filter(
      (rule): rule is HtmlCssValidationRuleDefinition => rule.target.kind !== 'javascript-source',
    );
    const analyses = new Map<string, JavaScriptAnalysisSuccess>();
    let analyzer: JavaScriptAnalyzerPort;
    try {
      analyzer = this.#analyzerFactory();
    } catch (error: unknown) {
      return blockedResult(context, 'system-error', [
        ...context.diagnostics,
        systemDiagnostic(
          'JAVASCRIPT_ANALYZER_CREATE_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      ]);
    }
    try {
      const sourceFiles = new Set(sourceRules.map(({ target }) => target.file));
      for (const file of sourceFiles) {
        if (context.files[file] === undefined) {
          return blockedResult(context, 'system-error', [
            ...context.diagnostics,
            systemDiagnostic('JAVASCRIPT_SOURCE_MISSING', `JavaScript source is missing: ${file}`),
          ]);
        }
      }

      if (runtime.sourceType === 'module') {
        const guardIdentifier = this.#guardIdentifierFactory();
        if (!GUARD_IDENTIFIER_PATTERN.test(guardIdentifier)) {
          return blockedResult(context, 'system-error', [
            ...context.diagnostics,
            systemDiagnostic('JAVASCRIPT_GUARD_INVALID', 'Validator guard identifier is invalid'),
          ]);
        }
        const files = Object.fromEntries(
          Object.entries(context.files).filter(([file]) => file.toLowerCase().endsWith('.js')),
        );
        const analysis = await analyzer.analyze({
          exerciseSessionId: identity.exerciseSessionId,
          executionRevision: identity.executionRevision,
          entryFile: runtime.entryFile,
          files,
          guardIdentifier,
          sourceType: runtime.sourceType,
          capabilityProfile: runtime.capabilityProfile,
        });
        if (analysis.status === 'failure') {
          return analysisFailureResult(context, analysis, identity.executionRevision);
        }
        if (!('graphSha256' in analysis)) {
          return blockedResult(context, 'system-error', [
            ...context.diagnostics,
            systemDiagnostic(
              'JAVASCRIPT_ANALYSIS_KIND_MISMATCH',
              'JavaScript Module validation received a single Source payload',
            ),
          ]);
        }
        const graphHashEvidence = indexedEvidence.get(
          JSON.stringify(['javascript.module-graph-sha256', null]),
        );
        if (
          typeof graphHashEvidence?.value !== 'string' ||
          !SOURCE_HASH_PATTERN.test(graphHashEvidence.value) ||
          graphHashEvidence.value !== analysis.graphSha256
        ) {
          return blockedResult(context, 'system-error', [
            ...context.diagnostics,
            systemDiagnostic(
              'JAVASCRIPT_MODULE_GRAPH_HASH_MISMATCH',
              'JavaScript Module graph hash does not match execution evidence',
            ),
          ]);
        }
        for (const file of sourceFiles) analyses.set(file, analysis);
      } else {
        for (const file of sourceFiles) {
          const source = context.files[file];
          const guardIdentifier = this.#guardIdentifierFactory();
          if (!GUARD_IDENTIFIER_PATTERN.test(guardIdentifier)) {
            return blockedResult(context, 'system-error', [
              ...context.diagnostics,
              systemDiagnostic('JAVASCRIPT_GUARD_INVALID', 'Validator guard identifier is invalid'),
            ]);
          }
          const analysis = await analyzer.analyze({
            exerciseSessionId: identity.exerciseSessionId,
            executionRevision: identity.executionRevision,
            file,
            source: source!,
            guardIdentifier,
            sourceType: runtime.sourceType,
            capabilityProfile: runtime.capabilityProfile,
          });
          if (analysis.status === 'failure') {
            return analysisFailureResult(context, analysis, identity.executionRevision);
          }
          if (!('sourceSha256' in analysis)) {
            return blockedResult(context, 'system-error', [
              ...context.diagnostics,
              systemDiagnostic(
                'JAVASCRIPT_ANALYSIS_KIND_MISMATCH',
                'JavaScript source validation received a Workspace graph payload',
              ),
            ]);
          }
          const hashEvidence = indexedEvidence.get(
            JSON.stringify(['javascript.source-sha256', file]),
          );
          if (
            typeof hashEvidence?.value !== 'string' ||
            !SOURCE_HASH_PATTERN.test(hashEvidence.value) ||
            hashEvidence.value !== analysis.sourceSha256
          ) {
            return blockedResult(context, 'system-error', [
              ...context.diagnostics,
              systemDiagnostic(
                'JAVASCRIPT_SOURCE_HASH_MISMATCH',
                `JavaScript source hash does not match execution evidence: ${file}`,
              ),
            ]);
          }
          analyses.set(file, analysis);
        }
      }

      let domChecks: readonly ValidationCheck[] = [];
      if (domRules.length > 0) {
        const domResult = await this.#domEngine.validate({
          ...context,
          rules: domRules,
          diagnostics: [],
        });
        if (domResult.status === 'system-error' || domResult.status === 'code-error') {
          return blockedResult(context, domResult.status, [
            ...context.diagnostics,
            ...domResult.diagnostics,
          ]);
        }
        domChecks = domResult.checks;
      }
      const sourceChecks = sourceRules.map((rule) =>
        sourceCheck(rule, analyses.get(rule.target.file)!),
      );
      const scenarioChecks = interactionChecks(
        context.interactionScenarios,
        context.interactionCheckpoints,
        Object.keys(context.snapshots),
      );
      const checksByRule = new Map(
        [...sourceChecks, ...domChecks].map((check) => [check.ruleId, check]),
      );
      const orderedChecks = [...rules.map((rule) => checksByRule.get(rule.id)!), ...scenarioChecks];
      const requirements = aggregateRequirements(rules, orderedChecks);
      const scenarioRequirements: readonly RequirementEvaluation[] = [
        ...new Map(
          scenarioChecks.map((check) => [
            check.requirementId,
            {
              id: check.requirementId,
              required: true,
              passed: check.requirementPassed,
            },
          ]),
        ).values(),
      ];
      const allRequirements = [...requirements, ...scenarioRequirements];
      const requirementsById = new Map(allRequirements.map((item) => [item.id, item]));
      const checks = orderedChecks.map((check) => ({
        ...check,
        requirementPassed: requirementsById.get(check.requirementId)!.passed,
      }));
      const passedRequirementIds = allRequirements
        .filter(({ passed }) => passed)
        .map(({ id }) => id);
      return {
        exerciseId: context.exerciseId,
        executionRevision: identity.executionRevision,
        status: allRequirements.every(({ required, passed }) => !required || passed)
          ? 'pass'
          : 'incomplete',
        checks,
        passedRequirementIds,
        diagnostics: [...context.diagnostics],
        evaluatedAt: context.now,
      };
    } catch (error: unknown) {
      return blockedResult(context, 'system-error', [
        ...context.diagnostics,
        systemDiagnostic(
          'JAVASCRIPT_VALIDATOR_FAILED',
          error instanceof Error ? error.message : String(error),
        ),
      ]);
    } finally {
      await analyzer.dispose().catch(() => undefined);
    }
  }
}
