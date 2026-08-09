import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InteractionRequest, RunnerConsoleRecord } from '../../../../core/runtime/contracts';
import {
  JAVASCRIPT_PROTOCOL_VERSION,
  JavaScriptExecutionClient,
  isJavaScriptRuntimeEnvelope,
} from './protocol';

const record: RunnerConsoleRecord = { sequence: 0, level: 'log', text: 'hello' };

/** 実行完了payloadへ差分を重ねたProtocol envelopeを作る。 */
function executionEnvelope(payload: Readonly<Record<string, unknown>>): unknown {
  return {
    version: JAVASCRIPT_PROTOCOL_VERSION,
    type: 'javascript.execution-complete',
    exerciseSessionId: 'session-1',
    executionRevision: 1,
    requestId: 'execution',
    oneTimeToken: 'token-1',
    payload: {
      executed: true,
      budgetExhausted: false,
      timerLimitExceeded: false,
      runtimeError: null,
      console: [record],
      ...payload,
    },
  };
}

/** Interaction response envelopeへ差分を重ねる。 */
function interactionEnvelope(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  return {
    version: JAVASCRIPT_PROTOCOL_VERSION,
    type: 'javascript.interaction-complete',
    exerciseSessionId: 'session-1',
    executionRevision: 1,
    frameGeneration: 7,
    requestId: 'interaction-1',
    oneTimeToken: 'interaction-token-1',
    payload: { error: null, console: [record] },
    ...overrides,
  };
}

/** Clientをinteraction可能な実行完了状態へ進める。 */
function dispatchExecutionReady(frame: HTMLIFrameElement): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: frame.contentWindow,
      data: executionEnvelope({}),
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('isJavaScriptRuntimeEnvelope console contract', () => {
  it('boundedでsequence順のplain text recordだけを受理する', () => {
    expect(isJavaScriptRuntimeEnvelope(executionEnvelope({}))).toBe(true);
    expect(
      isJavaScriptRuntimeEnvelope(
        executionEnvelope({
          console: [record, { sequence: 1, level: 'warn', text: '<b>plain text</b>' }],
        }),
      ),
    ).toBe(true);
  });

  it('件数超過・未知field・sequence不整合を拒否する', () => {
    expect(
      isJavaScriptRuntimeEnvelope(
        executionEnvelope({
          console: Array.from({ length: 101 }, (_, sequence) => ({ ...record, sequence })),
        }),
      ),
    ).toBe(false);
    expect(
      isJavaScriptRuntimeEnvelope(
        executionEnvelope({ console: [{ ...record, html: '<b>x</b>' }] }),
      ),
    ).toBe(false);
    expect(
      isJavaScriptRuntimeEnvelope(
        executionEnvelope({ console: [record, { ...record, sequence: 2 }] }),
      ),
    ).toBe(false);
  });

  it('1件と合計のUTF-8 byte上限を拒否する', () => {
    expect(
      isJavaScriptRuntimeEnvelope(
        executionEnvelope({ console: [{ ...record, text: 'あ'.repeat(1_366) }] }),
      ),
    ).toBe(false);
    expect(
      isJavaScriptRuntimeEnvelope(
        executionEnvelope({
          console: Array.from({ length: 17 }, (_, sequence) => ({
            ...record,
            sequence,
            text: 'x'.repeat(4_000),
          })),
        }),
      ),
    ).toBe(false);
  });

  it('frame generation付きのstrictなInteraction結果だけを受理する', () => {
    expect(isJavaScriptRuntimeEnvelope(interactionEnvelope())).toBe(true);
    expect(
      isJavaScriptRuntimeEnvelope(
        interactionEnvelope({
          payload: { error: { code: 'target-not-found', message: 'なし' }, console: [] },
        }),
      ),
    ).toBe(true);
    expect(isJavaScriptRuntimeEnvelope(interactionEnvelope({ frameGeneration: -1 }))).toBe(false);
    expect(
      isJavaScriptRuntimeEnvelope(
        interactionEnvelope({ payload: { error: null, console: [], unexpected: true } }),
      ),
    ).toBe(false);
    expect(
      isJavaScriptRuntimeEnvelope(
        interactionEnvelope({
          payload: { error: { code: 'unknown-code', message: 'x' }, console: [] },
        }),
      ),
    ).toBe(false);
  });
});

describe('JavaScriptExecutionClient interaction identity', () => {
  it('同じsource・session・revision・generation・request・tokenの応答だけを確定する', async () => {
    const frame = document.createElement('iframe');
    const wrongFrame = document.createElement('iframe');
    document.body.append(frame, wrongFrame);
    const postMessage = vi
      .spyOn(frame.contentWindow!, 'postMessage')
      .mockImplementation(() => undefined);
    const client = new JavaScriptExecutionClient(frame, 'session-1', 1, 'token-1', {
      frameGeneration: 7,
      tokenFactory: () => 'interaction-token-1',
    });
    dispatchExecutionReady(frame);
    await client.waitUntilExecuted();
    const request: InteractionRequest = {
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      frameGeneration: 7,
      requestId: 'interaction-1',
      action: { id: 'choose', kind: 'click', selector: '#answer' },
    };

    const pending = client.interact(request);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'javascript.interact',
        frameGeneration: 7,
        requestId: 'interaction-1',
        oneTimeToken: 'interaction-token-1',
        payload: request.action,
      }),
      '*',
    );
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    for (const [source, overrides] of [
      [wrongFrame.contentWindow, {}],
      [frame.contentWindow, { executionRevision: 2 }],
      [frame.contentWindow, { frameGeneration: 8 }],
      [frame.contentWindow, { oneTimeToken: 'wrong-token' }],
    ] as const) {
      window.dispatchEvent(
        new MessageEvent('message', {
          source,
          data: interactionEnvelope(overrides),
        }),
      );
    }
    await Promise.resolve();
    expect(settled).toBe(false);
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: interactionEnvelope(),
      }),
    );

    await expect(pending).resolves.toEqual({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      frameGeneration: 7,
      requestId: 'interaction-1',
      console: [record],
    });
    await expect(client.interact(request)).rejects.toThrow(/duplicated/u);
    client.dispose();
  });

  it('別generation要求を送信前に拒否し、disposeでpending Interactionを終了する', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const postMessage = vi
      .spyOn(frame.contentWindow!, 'postMessage')
      .mockImplementation(() => undefined);
    const client = new JavaScriptExecutionClient(frame, 'session-1', 1, 'token-1', {
      frameGeneration: 7,
      tokenFactory: () => 'interaction-token-1',
    });
    dispatchExecutionReady(frame);
    await client.waitUntilExecuted();

    await expect(
      client.interact({
        exerciseSessionId: 'session-1',
        executionRevision: 1,
        frameGeneration: 8,
        requestId: 'wrong-generation',
        action: { id: 'choose', kind: 'click', selector: '#answer' },
      }),
    ).rejects.toThrow(/identity/u);
    expect(postMessage).not.toHaveBeenCalled();

    const pending = client.interact({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      frameGeneration: 7,
      requestId: 'interaction-1',
      action: { id: 'choose', kind: 'click', selector: '#answer' },
    });
    client.dispose();
    await expect(pending).rejects.toThrow(/disposed/u);
  });
});
