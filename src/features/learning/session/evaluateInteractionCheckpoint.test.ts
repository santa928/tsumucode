import { describe, expect, it } from 'vitest';
import type { JavaScriptInteractionCheckpoint } from '../../../core/content/types';
import type { PreviewSnapshot, RunnerConsoleRecord } from '../../../core/runtime/contracts';
import { previewNode } from '../../../../tests/fixtures/validation';
import { evaluateInteractionCheckpoint } from './evaluateInteractionCheckpoint';

const checkpoint: JavaScriptInteractionCheckpoint = {
  id: 'score-ready',
  afterActionId: 'answer',
  expectations: [
    { id: 'result-exists', kind: 'selector-exists', selector: '#result' },
    { id: 'score-text', kind: 'selector-text', selector: '#result', equals: '2点' },
    {
      id: 'score-attribute',
      kind: 'attribute',
      selector: '#result',
      name: 'data-score',
      equals: '2',
    },
    { id: 'next-focused', kind: 'focused', selector: '#next' },
    { id: 'score-console', kind: 'console-includes', includes: 'score=2' },
  ],
};

/** Interaction evaluator用の同一identity Snapshotを作る。 */
function snapshot(): PreviewSnapshot {
  return {
    exerciseSessionId: 'session-1',
    executionRevision: 4,
    viewport: { id: 'desktop', width: 1280, height: 720 },
    nodes: [
      previewNode({
        nodeId: 1,
        documentOrder: 0,
        matchedSelectors: ['#result'],
        attributes: { 'data-score': '2' },
        text: '2点',
      }),
      previewNode({
        nodeId: 2,
        documentOrder: 1,
        matchedSelectors: ['#next'],
        focusable: true,
        focused: true,
      }),
    ],
    documentOverflow: {
      x: false,
      y: false,
      scrollWidth: 1280,
      scrollHeight: 720,
      clientWidth: 1280,
      clientHeight: 720,
    },
  };
}

describe('evaluateInteractionCheckpoint', () => {
  it('DOM・属性・focus・Consoleの5種期待値を観測事実だけから評価する', () => {
    const consoleRecords: readonly RunnerConsoleRecord[] = [
      { sequence: 0, level: 'log', text: 'score=2' },
    ];
    expect(evaluateInteractionCheckpoint(checkpoint, snapshot(), consoleRecords)).toEqual([
      { expectationId: 'result-exists', passed: true, actual: 'found' },
      { expectationId: 'score-text', passed: true, actual: '2点' },
      { expectationId: 'score-attribute', passed: true, actual: '2' },
      { expectationId: 'next-focused', passed: true, actual: 'true' },
      { expectationId: 'score-console', passed: true, actual: 'score=2' },
    ]);
  });

  it('対象やConsoleが未達ならboundedなactualを伴うfalseへ確定する', () => {
    const empty = { ...snapshot(), nodes: [] };
    const results = evaluateInteractionCheckpoint(checkpoint, empty, []);
    expect(results.every(({ passed }) => !passed)).toBe(true);
    expect(results.map(({ actual }) => actual)).toEqual([
      'not found',
      'not found',
      'not found',
      'false',
      'not found',
    ]);
  });

  it('開閉後は見える文字とAccessible Nameを独立に評価する', () => {
    const control: JavaScriptInteractionCheckpoint = {
      id: 'opened',
      afterActionId: 'open',
      expectations: [
        {
          id: 'visible-name',
          kind: 'selector-text',
          selector: '#toggle',
          equals: 'ヒントを閉じる',
        },
        {
          id: 'spoken-name',
          kind: 'accessible-name',
          selector: '#toggle',
          equals: 'ヒントを閉じる',
        },
      ],
    };
    const stale = {
      ...snapshot(),
      nodes: [
        previewNode({
          matchedSelectors: ['#toggle'],
          text: 'ヒントを閉じる',
          accessibleName: 'ヒントを開く',
        }),
      ],
    };
    expect(evaluateInteractionCheckpoint(control, stale, [])).toEqual([
      { expectationId: 'visible-name', passed: true, actual: 'ヒントを閉じる' },
      { expectationId: 'spoken-name', passed: false, actual: 'ヒントを開く' },
    ]);
    const synced = { ...stale, nodes: [{ ...stale.nodes[0]!, accessibleName: 'ヒントを閉じる' }] };
    expect(evaluateInteractionCheckpoint(control, synced, []).every(({ passed }) => passed)).toBe(
      true,
    );
    expect(evaluateInteractionCheckpoint(control, { ...stale, nodes: [] }, [])[1]).toEqual({
      expectationId: 'spoken-name',
      passed: false,
      actual: 'not found',
    });
  });
});
