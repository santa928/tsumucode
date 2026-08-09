/** Runtime の観測結果を学習要件へ評価する Validation 公開契約。 */
import type {
  ExerciseRuntime,
  JavaScriptInteractionScenario,
  ValidationRuleDefinition,
} from '../content/types';
import type {
  InteractionCheckpointResult,
  PreviewSnapshot,
  RunnerConsoleRecord,
  RunnerDiagnostic,
  RunnerEvidence,
  SnapshotPolicy,
} from '../runtime/contracts';

export type ValidatorRule = ValidationRuleDefinition;
export type ValidationStatus = 'pass' | 'incomplete' | 'code-error' | 'system-error';

export interface ValidationContext {
  readonly exerciseId: string;
  readonly rules: readonly ValidatorRule[];
  readonly runtime?: ExerciseRuntime;
  readonly files: Readonly<Record<string, string>>;
  readonly snapshots: Readonly<Record<string, PreviewSnapshot>>;
  readonly diagnostics: readonly RunnerDiagnostic[];
  readonly evidence: readonly RunnerEvidence[];
  /** 同一renderから得た非永続・bounded plain text Console。 */
  readonly console: readonly RunnerConsoleRecord[];
  /** Validatorが観測結果の欠落・未知IDをfail-closedに照合する公開Scenario定義。 */
  readonly interactionScenarios: readonly JavaScriptInteractionScenario[];
  readonly interactionCheckpoints: Readonly<Record<string, readonly InteractionCheckpointResult[]>>;
  readonly now: string;
}

export interface ValidationCheck {
  readonly ruleId: string;
  readonly requirementId: string;
  readonly label: string;
  readonly required: boolean;
  readonly passed: boolean;
  readonly requirementPassed: boolean;
  readonly message: string;
  readonly expected: string;
  readonly actual: string;
  readonly nextAction: string;
  readonly hintId?: string;
  readonly relatedSlideId?: string;
}

export interface ValidationResult {
  readonly exerciseId: string;
  readonly executionRevision: number | null;
  readonly status: ValidationStatus;
  readonly checks: readonly ValidationCheck[];
  readonly passedRequirementIds: readonly string[];
  readonly diagnostics: readonly RunnerDiagnostic[];
  readonly evaluatedAt: string;
}

export interface ValidatorAdapter {
  /** Content 検証済みの rules から必要な観測条件を純粋に導出し、入力を変更しない。 */
  buildSnapshotPolicy(rules: readonly ValidatorRule[]): SnapshotPolicy;
  /** 同一評価時点の rules・snapshots・diagnostics を評価し、入力を変更せず結果を返す。 */
  validate(context: ValidationContext): Promise<ValidationResult>;
}
