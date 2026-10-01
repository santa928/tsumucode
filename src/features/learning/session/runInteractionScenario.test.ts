import { expect, it, vi } from 'vitest';
import { runInteractionScenario, type InteractionScenarioInput } from './runInteractionScenario';

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
