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
