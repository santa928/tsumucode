/** 第2CourseのRunner／Validator／Editor Registry境界を検証する最小Adapter群。 */
import type { Extension } from '@codemirror/state';
import type {
  PreviewSnapshot,
  RunnerAdapter,
  RunnerInput,
  RunnerRenderResult,
  SnapshotPolicy,
  SnapshotRequest,
} from '../../src/core/runtime/contracts';
import type {
  ValidationContext,
  ValidationResult,
  ValidatorAdapter,
} from '../../src/core/validation/contracts';

/** fixture-langをplain text Extensionとして解決する。 */
export function fixtureEditorLanguage(): Extension {
  return [];
}

/** DOM実装に依存せずRunner RegistryとSession共通Flowを通すfixture Adapter。 */
export class FixtureRunnerAdapter implements RunnerAdapter {
  readonly languageId = 'fixture-runner';
  #lastInput: RunnerInput | undefined;

  /** fixtureではframe資源を持たず、共通prepare契約だけを受理する。 */
  async prepare(): Promise<void> {}

  /** 最新入力をsnapshot生成用に保持し、identityをそのまま返す。 */
  async render(input: RunnerInput): Promise<RunnerRenderResult> {
    this.#lastInput = structuredClone(input);
    return {
      exerciseSessionId: input.exerciseSessionId,
      executionRevision: input.executionRevision,
      diagnostics: [],
      evidence: [],
      console: [],
    };
  }

  /** 最新renderと同じviewportを空DOM snapshotとして返す。 */
  async requestSnapshot(request: SnapshotRequest): Promise<PreviewSnapshot> {
    const input = this.#lastInput;
    if (input === undefined) throw new Error('Fixture runner is not rendered');
    if (
      request.exerciseSessionId !== input.exerciseSessionId ||
      request.executionRevision !== input.executionRevision
    ) {
      throw new Error('Fixture snapshot identity does not match the latest render');
    }
    return {
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      viewport: input.viewport,
      nodes: [],
      documentOverflow: {
        x: false,
        y: false,
        scrollWidth: 1,
        scrollHeight: 1,
        clientWidth: 1,
        clientHeight: 1,
      },
    };
  }

  /** 保持したfixture入力を解放する。 */
  async dispose(): Promise<void> {
    this.#lastInput = undefined;
  }
}

/** open rule payloadを共通Sessionから受けてpassへ変換するfixture Validator。 */
export class FixtureValidatorAdapter implements ValidatorAdapter {
  /** fixtureはDOM nodeを要求しない空snapshot policyを返す。 */
  buildSnapshotPolicy(): SnapshotPolicy {
    return {
      selectors: [],
      attributes: [],
      computedStyles: [],
      focusVisibleSelectors: [],
      focusVisibleComputedStyles: [],
      includeAllElements: false,
    };
  }

  /** Rule requirementを全てpassとして返し、Registry境界だけを検証する。 */
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const executionRevision = Object.values(context.snapshots)[0]?.executionRevision ?? null;
    return {
      exerciseId: context.exerciseId,
      executionRevision,
      status: 'pass',
      checks: [],
      passedRequirementIds: context.rules.map((rule) => rule.groupId ?? rule.id),
      diagnostics: context.diagnostics,
      evaluatedAt: context.now,
    };
  }
}
