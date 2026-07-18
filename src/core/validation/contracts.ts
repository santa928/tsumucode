/** Runtime の観測結果を学習要件へ評価する Validation 公開契約。 */
import type { ValidationRuleDefinition } from '../content/types';
import type { PreviewSnapshot, RunnerDiagnostic, SnapshotPolicy } from '../runtime/contracts';

export type ValidatorRule = ValidationRuleDefinition;
export type ValidationStatus = 'pass' | 'incomplete' | 'code-error' | 'system-error';

export interface ValidationContext {
  readonly exerciseId: string;
  readonly rules: readonly ValidatorRule[];
  readonly snapshots: Readonly<Record<string, PreviewSnapshot>>;
  readonly diagnostics: readonly RunnerDiagnostic[];
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
