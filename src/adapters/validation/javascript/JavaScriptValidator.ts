import type {
  HtmlCssValidationRuleDefinition,
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
      for (const file of new Set(sourceRules.map(({ target }) => target.file))) {
        const source = context.files[file];
        if (source === undefined) {
          return blockedResult(context, 'system-error', [
            ...context.diagnostics,
            systemDiagnostic('JAVASCRIPT_SOURCE_MISSING', `JavaScript source is missing: ${file}`),
          ]);
        }
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
          source,
          guardIdentifier,
          sourceType: runtime.sourceType,
          capabilityProfile: runtime.capabilityProfile,
        });
        if (analysis.status === 'failure') {
          return analysisFailureResult(context, analysis, identity.executionRevision);
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
      const checksByRule = new Map(
        [...sourceChecks, ...domChecks].map((check) => [check.ruleId, check]),
      );
      const orderedChecks = rules.map((rule) => checksByRule.get(rule.id)!);
      const requirements = aggregateRequirements(rules, orderedChecks);
      const requirementsById = new Map(requirements.map((item) => [item.id, item]));
      const checks = orderedChecks.map((check) => ({
        ...check,
        requirementPassed: requirementsById.get(check.requirementId)!.passed,
      }));
      const passedRequirementIds = requirements.filter(({ passed }) => passed).map(({ id }) => id);
      return {
        exerciseId: context.exerciseId,
        executionRevision: identity.executionRevision,
        status: requirements.every(({ required, passed }) => !required || passed)
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
