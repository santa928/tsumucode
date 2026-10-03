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

/** 対象の実boxとCSS、認証Snapshot内の祖先だけで表示を確認する。 */
function isNodeVisible(node: PreviewNode, byId: ReadonlyMap<number, PreviewNode>): boolean {
  if (
    !Number.isFinite(node.rect.width) ||
    !Number.isFinite(node.rect.height) ||
    node.rect.width <= 0 ||
    node.rect.height <= 0 ||
    node.computedStyles['visibility'] !== 'visible'
  ) {
    return false;
  }
  const visited = new Set<number>();
  let current: PreviewNode | undefined = node;
  while (current !== undefined) {
    if (visited.has(current.nodeId)) return false;
    visited.add(current.nodeId);
    const display = current.computedStyles['display'];
    const rawOpacity = current.computedStyles['opacity'];
    const opacity =
      rawOpacity === undefined || rawOpacity.trim().length === 0 ? NaN : Number(rawOpacity);
    if (
      display === undefined ||
      display.length === 0 ||
      display === 'none' ||
      !Number.isFinite(opacity) ||
      opacity <= 0 ||
      opacity > 1
    ) {
      return false;
    }
    if (current.parentId === null) return true;
    current = byId.get(current.parentId);
  }
  return false;
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
    if (expectation.kind === 'selector-visible') {
      const byId = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
      const visible =
        byId.size === snapshot.nodes.length && nodes.some((node) => isNodeVisible(node, byId));
      return {
        expectationId: expectation.id,
        passed: visible,
        actual: visible ? 'visible' : 'not visible',
      };
    }
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
    if (expectation.kind === 'input-value') {
      const actual = first?.inputValue;
      return {
        expectationId: expectation.id,
        passed: nodes.some(
          ({ inputValue }) => inputValue !== undefined && inputValue === expectation.equals,
        ),
        actual: actual === undefined ? 'not observed' : boundedActual(actual),
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
