import type { JavaScriptInteractionCheckpoint } from '../../../core/content/types';
import type {
  InteractionExpectationResult,
  PreviewNode,
  PreviewSnapshot,
  RunnerConsoleRecord,
  SubmitEvidence,
} from '../../../core/runtime/contracts';

const MAX_ACTUAL_LENGTH = 2_000;

/** Validatorへ渡すactualを表示・保存可能な上限へ丸める。 */
function boundedActual(value: string): string {
  return value.slice(0, MAX_ACTUAL_LENGTH);
}

/** Snapshot内で指定selectorに一致するとBridgeが認証したNodeだけを返す。 */
function matchingNodes(snapshot: PreviewSnapshot, selector: string): readonly PreviewNode[] {
  return snapshot.nodes.filter(({ matchedSelectors }) => matchedSelectors.includes(selector));
}

/** checkpointをSnapshot・非永続Console・認証Interactionの取消観測から評価する。 */
export function evaluateInteractionCheckpoint(
  checkpoint: JavaScriptInteractionCheckpoint,
  snapshot: PreviewSnapshot,
  consoleRecords: readonly RunnerConsoleRecord[],
  submitEvidence?: SubmitEvidence,
): readonly InteractionExpectationResult[] {
  return checkpoint.expectations.map((expectation): InteractionExpectationResult => {
    if (expectation.kind === 'submit-prevented') {
      return {
        expectationId: expectation.id,
        passed: submitEvidence === 'prevented',
        actual: submitEvidence ?? 'unsupported',
      };
    }
    if (expectation.kind === 'console-includes') {
      const matched = consoleRecords.find(({ text }) => text.includes(expectation.includes));
      return {
        expectationId: expectation.id,
        passed: matched !== undefined,
        actual: matched === undefined ? 'not found' : boundedActual(matched.text),
      };
    }
    const nodes = matchingNodes(snapshot, expectation.selector);
    if (expectation.kind === 'selector-exists') {
      return {
        expectationId: expectation.id,
        passed: nodes.length > 0,
        actual: nodes.length > 0 ? 'found' : 'not found',
      };
    }
    if (expectation.kind === 'focused') {
      const focused = nodes.some((node) => node.focused);
      return {
        expectationId: expectation.id,
        passed: focused,
        actual: String(focused),
      };
    }
    const first = nodes[0];
    if (expectation.kind === 'selector-text') {
      const actual = first?.text;
      return {
        expectationId: expectation.id,
        passed: nodes.some(({ text }) => text === expectation.equals),
        actual: actual === undefined ? 'not found' : boundedActual(actual),
      };
    }
    if (expectation.kind === 'accessible-name') {
      const actual = first?.accessibleName;
      return {
        expectationId: expectation.id,
        passed: nodes.some(({ accessibleName }) => accessibleName === expectation.equals),
        actual: actual === undefined ? 'not found' : boundedActual(actual),
      };
    }
    const actual = first?.attributes[expectation.name];
    return {
      expectationId: expectation.id,
      passed: nodes.some(({ attributes }) => attributes[expectation.name] === expectation.equals),
      actual: actual === undefined ? 'not found' : boundedActual(actual),
    };
  });
}
