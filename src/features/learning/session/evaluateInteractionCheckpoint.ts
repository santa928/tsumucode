import type { JavaScriptInteractionCheckpoint } from '../../../core/content/types';
import type {
  InteractionExpectationResult,
  PreviewNode,
  PreviewSnapshot,
  RunnerConsoleRecord,
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

/** 1 checkpointの5種期待値をSnapshotと非永続Consoleだけから決定的に評価する。 */
export function evaluateInteractionCheckpoint(
  checkpoint: JavaScriptInteractionCheckpoint,
  snapshot: PreviewSnapshot,
  consoleRecords: readonly RunnerConsoleRecord[],
): readonly InteractionExpectationResult[] {
  return checkpoint.expectations.map((expectation): InteractionExpectationResult => {
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
    const actual = first?.attributes[expectation.name];
    return {
      expectationId: expectation.id,
      passed: nodes.some(({ attributes }) => attributes[expectation.name] === expectation.equals),
      actual: actual === undefined ? 'not found' : boundedActual(actual),
    };
  });
}
