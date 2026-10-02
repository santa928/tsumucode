import type {
  Exercise,
  JavaScriptInteractionScenario,
  PreviewViewport,
} from '../../../core/content/types';
import type {
  InteractionCheckpointResult,
  InteractionRequest,
  InteractionResult,
  RunnerRenderResult,
  SnapshotPolicy,
  SnapshotRequest,
  PreviewSnapshot,
} from '../../../core/runtime/contracts';
import { evaluateInteractionCheckpoint } from './evaluateInteractionCheckpoint';

const INTERACTION_POLL_INTERVAL_MS = 25;
const INTERACTION_POLL_TIMEOUT_MS = 750;
const MAX_INTERACTION_POLICY_ITEMS = 64;

/** ScenarioのDOM期待値を既存Validator policyへ重複なく追加する。 */
export function extendSnapshotPolicyForInteractions(
  policy: SnapshotPolicy,
  exercises: readonly Pick<Exercise, 'interactionScenarios'>[],
): SnapshotPolicy {
  const selectors = new Set(policy.selectors);
  const attributes = new Set(policy.attributes);
  const computedStyles = new Set(policy.computedStyles);
  for (const exercise of exercises) {
    for (const scenario of exercise.interactionScenarios ?? []) {
      for (const checkpoint of scenario.checkpoints) {
        for (const expectation of checkpoint.expectations) {
          if (expectation.kind === 'console-includes' || expectation.kind === 'submit-prevented')
            continue;
          selectors.add(expectation.selector);
          if (expectation.kind === 'selector-visible') {
            for (const property of ['display', 'visibility', 'opacity'])
              computedStyles.add(property);
          }
          if (expectation.kind === 'attribute') attributes.add(expectation.name);
        }
      }
    }
  }
  if (
    selectors.size > MAX_INTERACTION_POLICY_ITEMS ||
    attributes.size > MAX_INTERACTION_POLICY_ITEMS ||
    computedStyles.size > MAX_INTERACTION_POLICY_ITEMS
  ) {
    throw new Error('Interaction Snapshot policyが上限を超えています');
  }
  return {
    ...policy,
    selectors: [...selectors],
    attributes: [...attributes],
    computedStyles: [...computedStyles],
  };
}

/** 製品・Fixtureの両方で、認証された実操作とSnapshotだけを評価するport。 */
export interface InteractionScenarioInput {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly viewport: PreviewViewport;
  readonly policy: SnapshotPolicy;
  readonly scenario: JavaScriptInteractionScenario;
  readonly render: () => Promise<RunnerRenderResult>;
  readonly interact: (request: InteractionRequest) => Promise<InteractionResult>;
  readonly requestSnapshot: (request: SnapshotRequest) => Promise<PreviewSnapshot>;
  readonly assertFresh: () => void;
  readonly nextRequestId: () => string;
  readonly assertGradable: (interaction: InteractionResult) => void;
}

/** Scenarioごとにfresh frameを描画し、identityを検証しながら実操作・最大750msの観測を行う。 */
export async function runInteractionScenario(
  input: InteractionScenarioInput,
): Promise<InteractionCheckpointResult[]> {
  const { exerciseSessionId, executionRevision, viewport, policy, scenario } = input;
  input.assertFresh();
  const rendered = await input.render();
  input.assertFresh();
  if (
    rendered.exerciseSessionId !== exerciseSessionId ||
    rendered.executionRevision !== executionRevision
  ) {
    throw new Error('Interaction render identityが要求と一致しません');
  }
  if (rendered.diagnostics.some(({ severity }) => severity === 'error')) {
    throw new Error('Interaction ScenarioのPreviewを準備できませんでした');
  }
  const frameGeneration = rendered.frameGeneration;
  if (
    frameGeneration === undefined ||
    !Number.isSafeInteger(frameGeneration) ||
    frameGeneration < 0
  ) {
    throw new Error('Runnerが有効なframe generationを返しませんでした');
  }
  const results: InteractionCheckpointResult[] = [];
  for (const action of scenario.actions) {
    input.assertFresh();
    const requestId = input.nextRequestId();
    const interaction = await input.interact({
      exerciseSessionId,
      executionRevision,
      frameGeneration,
      requestId,
      action,
    });
    input.assertFresh();
    if (
      interaction.exerciseSessionId !== exerciseSessionId ||
      interaction.executionRevision !== executionRevision ||
      interaction.frameGeneration !== frameGeneration ||
      interaction.requestId !== requestId
    ) {
      throw new Error('Interaction result identityが要求と一致しません');
    }
    input.assertGradable(interaction);
    if (
      scenario.checkpoints.some(
        (checkpoint) =>
          checkpoint.afterActionId === action.id &&
          checkpoint.expectations.some((expectation) => expectation.kind === 'submit-prevented'),
      ) &&
      (interaction.submitEvidence === undefined ||
        interaction.submitEvidence === 'unsupported' ||
        interaction.submitEvidence === 'setup-error')
    ) {
      throw new Error('Form取消の観測を取得できませんでした');
    }
    for (const checkpoint of scenario.checkpoints) {
      if (checkpoint.afterActionId !== action.id) continue;
      const deadline = Date.now() + INTERACTION_POLL_TIMEOUT_MS;
      for (;;) {
        input.assertFresh();
        const snapshot = await input.requestSnapshot({
          exerciseSessionId,
          executionRevision,
          requestId: input.nextRequestId(),
          policy,
          preserveTimers: true,
        });
        input.assertFresh();
        if (
          snapshot.exerciseSessionId !== exerciseSessionId ||
          snapshot.executionRevision !== executionRevision ||
          snapshot.viewport.id !== viewport.id ||
          snapshot.viewport.width !== viewport.width ||
          snapshot.viewport.height !== viewport.height
        ) {
          throw new Error('Interaction Snapshot identityが要求と一致しません');
        }
        const observed = snapshot.runtimeObservation;
        if (observed !== undefined) input.assertGradable({ ...interaction, ...observed });
        const expectations = evaluateInteractionCheckpoint(
          checkpoint,
          snapshot,
          observed?.console ?? interaction.console,
          interaction.submitEvidence,
        );
        if (expectations.every(({ passed }) => passed) || Date.now() >= deadline) {
          results.push({
            exerciseSessionId,
            executionRevision,
            frameGeneration,
            viewportId: viewport.id,
            scenarioId: scenario.id,
            checkpointId: checkpoint.id,
            afterActionId: action.id,
            expectations,
          });
          break;
        }
        await new Promise<void>((resolve) => {
          setTimeout(
            resolve,
            Math.min(INTERACTION_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())),
          );
        });
        input.assertFresh();
      }
    }
  }
  return results;
}
