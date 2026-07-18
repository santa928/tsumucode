import type { HtmlCssValidationRuleDefinition } from '../../src/core/content/types';
import type { PreviewNode, PreviewSnapshot } from '../../src/core/runtime/contracts';
import type { ValidationContext } from '../../src/core/validation/contracts';

/** Validation testで使う最小のHTML/CSS Ruleを生成する。 */
export function validationRule(
  overrides: Partial<HtmlCssValidationRuleDefinition> = {},
): HtmlCssValidationRuleDefinition {
  return {
    id: 'main-exists',
    label: '主要領域を用意する',
    required: true,
    group: 'all',
    viewportMode: 'all',
    viewportIds: ['desktop'],
    target: { kind: 'selector', selector: 'main' },
    assertion: { kind: 'exists' },
    feedback: {
      target: 'main要素',
      expected: 'main要素が存在する',
      nextAction: 'main要素を追加する',
    },
    hintId: 'hint-1',
    relatedSlideId: 'slide-1',
    ...overrides,
  };
}

/** Validation testで使う観測済みElementを生成する。 */
export function previewNode(overrides: Partial<PreviewNode> = {}): PreviewNode {
  return {
    nodeId: 1,
    parentId: null,
    documentOrder: 0,
    tagName: 'main',
    matchedSelectors: ['main', '.layout'],
    attributes: { class: 'layout' },
    text: '違う文章でも条件を満たせる',
    computedStyles: {
      display: 'grid',
      gap: '24px',
      color: 'rgb(0, 0, 0)',
      'background-color': 'rgb(255, 255, 255)',
      'background-image': 'none',
    },
    rect: { x: 0, y: 0, width: 960, height: 500 },
    overflow: {
      x: false,
      y: false,
      scrollWidth: 960,
      scrollHeight: 500,
      clientWidth: 960,
      clientHeight: 500,
    },
    focusable: false,
    accessibleName: 'メインコンテンツ',
    role: 'main',
    ...overrides,
  };
}

/** Validation testで使う同一評価時点のSnapshotを生成する。 */
export function previewSnapshot(overrides: Partial<PreviewSnapshot> = {}): PreviewSnapshot {
  return {
    exerciseSessionId: 'session-1',
    executionRevision: 4,
    viewport: { id: 'desktop', width: 1280, height: 720 },
    nodes: [previewNode()],
    documentOverflow: {
      x: false,
      y: false,
      scrollWidth: 1280,
      scrollHeight: 720,
      clientWidth: 1280,
      clientHeight: 720,
    },
    ...overrides,
  };
}

/** Validation Engineの入力を安全な既定値付きで生成する。 */
export function validationContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    exerciseId: 'exercise-1',
    rules: [validationRule()],
    snapshots: { desktop: previewSnapshot() },
    diagnostics: [],
    now: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}
