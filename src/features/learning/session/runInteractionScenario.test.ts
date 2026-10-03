import { expect, it, vi } from 'vitest';
import {
  extendSnapshotPolicyForInteractions,
  runInteractionScenario,
  type InteractionScenarioInput,
} from './runInteractionScenario';

/** 遅延結果を表す小さな実portで、観測頻度と期限・取消の境界を確認する。 */
function delayedScenario(
  readyAt: number,
  snapshotCostMs = 0,
): {
  input: InteractionScenarioInput;
  requestIds: string[];
  interact: ReturnType<typeof vi.fn<InteractionScenarioInput['interact']>>;
} {
  const requestIds: string[] = [];
  let sequence = 0;
  const interact = vi.fn<InteractionScenarioInput['interact']>(async (request) => ({
    ...request,
    console: [],
    diagnostics: [],
  }));
  return {
    requestIds,
    interact,
    input: {
      exerciseSessionId: 'delayed-scenario',
      executionRevision: 1,
      viewport: { id: 'desktop', width: 1280, height: 720 },
      policy: {
        selectors: [],
        attributes: [],
        computedStyles: [],
        focusVisibleSelectors: [],
        focusVisibleComputedStyles: [],
        includeAllElements: false,
      },
      scenario: {
        id: 'delayed',
        label: '遅延結果',
        actions: [{ id: 'click', kind: 'click', selector: '#button' }],
        checkpoints: [
          {
            id: 'ready',
            afterActionId: 'click',
            expectations: [{ id: 'log', kind: 'console-includes', includes: '完了' }],
          },
        ],
      },
      render: async () => ({
        exerciseSessionId: 'delayed-scenario',
        executionRevision: 1,
        frameGeneration: 1,
        diagnostics: [],
        evidence: [],
        console: [],
      }),
      interact,
      requestSnapshot: async (request) => {
        requestIds.push(request.requestId);
        expect(request.preserveTimers).toBe(true);
        vi.setSystemTime(Date.now() + snapshotCostMs);
        return {
          exerciseSessionId: 'delayed-scenario',
          executionRevision: 1,
          viewport: { id: 'desktop', width: 1280, height: 720 },
          nodes: [],
          documentOverflow: {
            x: false,
            y: false,
            scrollWidth: 1280,
            scrollHeight: 720,
            clientWidth: 1280,
            clientHeight: 720,
          },
          runtimeObservation: {
            diagnostics: [],
            console: Date.now() >= readyAt ? [{ sequence: 0, level: 'log', text: '完了' }] : [],
          },
        };
      },
      assertFresh: () => undefined,
      nextRequestId: () => `request-${String(++sequence)}`,
      assertGradable: () => undefined,
    },
  };
}

it('表示期待値は既存SnapshotへCSS3属性を有界に追加し、他policyを変えない', () => {
  const input = delayedScenario(0).input;
  const scenario = {
    ...input.scenario,
    checkpoints: [
      {
        id: 'shown',
        afterActionId: 'click',
        expectations: [
          { id: 'question', kind: 'selector-visible' as const, selector: '#question' },
        ],
      },
    ],
  };
  const result = extendSnapshotPolicyForInteractions(input.policy, [
    { interactionScenarios: [scenario] },
  ]);
  expect(result.computedStyles).toEqual(['display', 'visibility', 'opacity']);
  expect(result.selectors).toEqual(['#question']);
  expect(input.policy.computedStyles).toEqual([]);
  expect(() =>
    extendSnapshotPolicyForInteractions(
      {
        ...input.policy,
        computedStyles: Array.from({ length: 64 }, (_, i) => `--property-${String(i)}`),
      },
      [{ interactionScenarios: [scenario] }],
    ),
  ).toThrow('上限');
});

it('80ms後の結果を100ms以内に実観測し、操作を再送しない', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  try {
    const port = delayedScenario(80, 5);
    const pending = runInteractionScenario(port.input);
    await vi.runAllTimersAsync();
    expect((await pending)[0]?.expectations[0]?.passed).toBe(true);
    expect(Date.now()).toBeLessThan(100);
    expect(port.interact).toHaveBeenCalledTimes(1);
    expect(new Set(port.requestIds).size).toBe(port.requestIds.length);
  } finally {
    vi.useRealTimers();
  }
});

it('未一致の観測は750msで失敗を返し、有界の一意requestを維持する', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  try {
    const port = delayedScenario(Infinity);
    const pending = runInteractionScenario(port.input);
    await vi.runAllTimersAsync();
    expect((await pending)[0]?.expectations[0]?.passed).toBe(false);
    expect(Date.now()).toBe(750);
    expect(port.requestIds.length).toBeLessThanOrEqual(31);
    expect(new Set(port.requestIds).size).toBe(port.requestIds.length);
    expect(port.interact).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it('待機中に編集された観測を取消し、古い結果を保存しない', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  try {
    const port = delayedScenario(80);
    port.input = {
      ...port.input,
      assertFresh: () => {
        if (Date.now() >= 25) throw new Error('stale revision');
      },
    };
    const pending = expect(runInteractionScenario(port.input)).rejects.toThrow('stale revision');
    await vi.runAllTimersAsync();
    await pending;
    expect(port.interact).toHaveBeenCalledTimes(1);
    expect(port.requestIds).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  { exerciseSessionId: 'stale-session', executionRevision: 1 },
  { exerciseSessionId: 'active-session', executionRevision: 0 },
])('renderの別session/revisionを操作開始前に拒否する: %j', async (identity) => {
  const interact = vi.fn<InteractionScenarioInput['interact']>();
  const requestSnapshot = vi.fn<InteractionScenarioInput['requestSnapshot']>();
  await expect(
    runInteractionScenario({
      exerciseSessionId: 'active-session',
      executionRevision: 1,
      viewport: { id: 'desktop', width: 1280, height: 720 },
      policy: {
        selectors: [],
        attributes: [],
        computedStyles: [],
        focusVisibleSelectors: [],
        focusVisibleComputedStyles: [],
        includeAllElements: false,
      },
      scenario: {
        id: 'click-flow',
        label: 'クリック',
        actions: [{ id: 'click', kind: 'click', selector: '#button' }],
        checkpoints: [],
      },
      render: async () => ({
        ...identity,
        frameGeneration: 1,
        diagnostics: [],
        evidence: [],
        console: [],
      }),
      interact,
      requestSnapshot,
      assertFresh: () => undefined,
      nextRequestId: () => 'request',
      assertGradable: () => undefined,
    }),
  ).rejects.toThrow('Interaction render identityが要求と一致しません');
  expect(interact).not.toHaveBeenCalled();
  expect(requestSnapshot).not.toHaveBeenCalled();
});

it.each([undefined, 'unsupported', 'setup-error'] as const)(
  'Form観測が取得不能なら不正解にせずScenarioを中断する: %s',
  async (submitEvidence) => {
    const requestSnapshot = vi.fn<InteractionScenarioInput['requestSnapshot']>();
    await expect(
      runInteractionScenario({
        exerciseSessionId: 'active-session',
        executionRevision: 1,
        viewport: { id: 'desktop', width: 1280, height: 720 },
        policy: {
          selectors: [],
          attributes: [],
          computedStyles: [],
          focusVisibleSelectors: [],
          focusVisibleComputedStyles: [],
          includeAllElements: false,
        },
        scenario: {
          id: 'submit-flow',
          label: '送信取消',
          actions: [{ id: 'send', kind: 'click', selector: '#send' }],
          checkpoints: [
            {
              id: 'cancelled',
              afterActionId: 'send',
              expectations: [{ id: 'cancel', kind: 'submit-prevented' }],
            },
          ],
        },
        render: async () => ({
          exerciseSessionId: 'active-session',
          executionRevision: 1,
          frameGeneration: 1,
          diagnostics: [],
          evidence: [],
          console: [],
        }),
        interact: async (request) => ({
          ...request,
          console: [],
          diagnostics: [],
          ...(submitEvidence === undefined ? {} : { submitEvidence }),
        }),
        requestSnapshot,
        assertFresh: () => undefined,
        nextRequestId: () => 'request',
        assertGradable: () => undefined,
      }),
    ).rejects.toThrow('Form取消の観測を取得できませんでした');
    expect(requestSnapshot).not.toHaveBeenCalled();
  },
);

it.each(['late-budget', 'late-console'] as const)(
  'Snapshot観測の遅延状態を操作再送せず採点へ渡す: %s',
  async (mode) => {
    const interact = vi.fn<InteractionScenarioInput['interact']>(async (request) => ({
      ...request,
      console: [],
      diagnostics: [],
    }));
    const diagnostics =
      mode === 'late-budget'
        ? [
            {
              code: 'javascript-budget',
              kind: 'system' as const,
              severity: 'error' as const,
              message: 'budget',
              learnerMessage: '停止しました',
            },
          ]
        : [];
    const run = runInteractionScenario({
      exerciseSessionId: 'active-session',
      executionRevision: 1,
      viewport: { id: 'desktop', width: 1280, height: 720 },
      policy: {
        selectors: [],
        attributes: [],
        computedStyles: [],
        focusVisibleSelectors: [],
        focusVisibleComputedStyles: [],
        includeAllElements: false,
      },
      scenario: {
        id: 'late',
        label: '遅延結果',
        actions: [{ id: 'click', kind: 'click', selector: '#button' }],
        checkpoints: [
          {
            id: 'done',
            afterActionId: 'click',
            expectations: [{ id: 'log', kind: 'console-includes', includes: '遅延結果' }],
          },
        ],
      },
      render: async () => ({
        exerciseSessionId: 'active-session',
        executionRevision: 1,
        frameGeneration: 1,
        diagnostics: [],
        evidence: [],
        console: [],
      }),
      interact,
      requestSnapshot: async () => ({
        exerciseSessionId: 'active-session',
        executionRevision: 1,
        viewport: { id: 'desktop', width: 1280, height: 720 },
        nodes: [],
        documentOverflow: {
          x: false,
          y: false,
          scrollWidth: 1280,
          scrollHeight: 720,
          clientWidth: 1280,
          clientHeight: 720,
        },
        runtimeObservation: {
          diagnostics,
          console: [{ sequence: 0, level: 'log' as const, text: '遅延結果' }],
        },
      }),
      assertFresh: () => undefined,
      nextRequestId: () => 'request',
      assertGradable: (result) => {
        if (result.diagnostics?.some((d) => d.kind === 'system'))
          throw new Error('非採点の制限停止');
      },
    });
    if (mode === 'late-budget') await expect(run).rejects.toThrow('非採点の制限停止');
    else expect((await run)[0]?.expectations[0]?.passed).toBe(true);
    expect(interact).toHaveBeenCalledTimes(1);
  },
);

it('input-value要求selectorだけをSnapshotへ接続し、旧policyには値収集を追加しない', () => {
  const { input } = delayedScenario(0);
  const scenario = {
    ...input.scenario,
    checkpoints: [
      {
        id: 'reopened',
        afterActionId: 'click',
        expectations: [
          { id: 'empty', kind: 'input-value' as const, selector: '#answer', equals: '' },
        ],
      },
    ],
  };
  expect(
    extendSnapshotPolicyForInteractions(input.policy, [{ interactionScenarios: [scenario] }]),
  ).toMatchObject({
    selectors: ['#answer'],
    inputValueSelectors: ['#answer'],
  });
  expect(extendSnapshotPolicyForInteractions(input.policy, [])).not.toHaveProperty(
    'inputValueSelectors',
  );
  expect(input.policy).not.toHaveProperty('inputValueSelectors');
});
