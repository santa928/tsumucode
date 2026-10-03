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
      currentTargetFailure: null,
      submitEvidence: 'unsupported',
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
    payload: {
      error: null,
      budgetExhausted: false,
      timerLimitExceeded: false,
      runtimeError: null,
      console: [record],
      currentTargetFailure: null,
      submitEvidence: 'unsupported',
    },
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
  it('初回とinteractionのcurrentTarget保護状態を必須の有限値として検証する', () => {
    for (const currentTargetFailure of [null, 'unsupported', 'setup-error']) {
      expect(isJavaScriptRuntimeEnvelope(executionEnvelope({ currentTargetFailure }))).toBe(true);
      expect(
        isJavaScriptRuntimeEnvelope(
          interactionEnvelope({
            payload: {
              error: null,
              budgetExhausted: false,
              timerLimitExceeded: false,
              runtimeError: null,
              console: [],
              currentTargetFailure,
              submitEvidence: 'unsupported',
            },
          }),
        ),
      ).toBe(true);
    }
    for (const currentTargetFailure of [undefined, false, 'unknown', {}, []]) {
      expect(isJavaScriptRuntimeEnvelope(executionEnvelope({ currentTargetFailure }))).toBe(false);
      expect(
        isJavaScriptRuntimeEnvelope(
          interactionEnvelope({
            payload: {
              error: null,
              budgetExhausted: false,
              timerLimitExceeded: false,
              runtimeError: null,
              console: [],
              currentTargetFailure,
              submitEvidence: 'unsupported',
            },
          }),
        ),
      ).toBe(false);
    }
  });

  it('submit観測を有限値で検証し欠落・任意値・旧versionを拒否する', () => {
    for (const submitEvidence of ['unsupported', 'setup-error', 'prevented', 'not-prevented']) {
      expect(isJavaScriptRuntimeEnvelope(executionEnvelope({ submitEvidence }))).toBe(true);
      expect(
        isJavaScriptRuntimeEnvelope(
          interactionEnvelope({
            payload: {
              error: null,
              budgetExhausted: false,
              timerLimitExceeded: false,
              runtimeError: null,
              console: [],
              currentTargetFailure: null,
              submitEvidence,
            },
          }),
        ),
      ).toBe(true);
    }
    for (const submitEvidence of [undefined, null, true, 'approved', {}, []]) {
      expect(isJavaScriptRuntimeEnvelope(executionEnvelope({ submitEvidence }))).toBe(false);
      expect(
        isJavaScriptRuntimeEnvelope(
          interactionEnvelope({
            payload: {
              error: null,
              budgetExhausted: false,
              timerLimitExceeded: false,
              runtimeError: null,
              console: [],
              currentTargetFailure: null,
              submitEvidence,
            },
          }),
        ),
      ).toBe(false);
    }
    expect(isJavaScriptRuntimeEnvelope(interactionEnvelope({ version: 2 }))).toBe(false);
  });

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
          payload: {
            error: { code: 'target-not-found', message: 'なし' },
            budgetExhausted: false,
            timerLimitExceeded: false,
            runtimeError: null,
            console: [],
            currentTargetFailure: null,
            submitEvidence: 'unsupported',
          },
        }),
      ),
    ).toBe(true);
    expect(isJavaScriptRuntimeEnvelope(interactionEnvelope({ frameGeneration: -1 }))).toBe(false);
    expect(
      isJavaScriptRuntimeEnvelope(
        interactionEnvelope({
          payload: {
            error: null,
            budgetExhausted: false,
            timerLimitExceeded: false,
            runtimeError: null,
            console: [],
            currentTargetFailure: null,
            submitEvidence: 'unsupported',
            unexpected: true,
          },
        }),
      ),
    ).toBe(false);
    expect(
      isJavaScriptRuntimeEnvelope(
        interactionEnvelope({
          payload: {
            error: { code: 'unknown-code', message: 'x' },
            console: [],
            currentTargetFailure: null,
            submitEvidence: 'unsupported',
          },
        }),
      ),
    ).toBe(false);
  });
});

describe('JavaScriptExecutionClient interaction identity', () => {
  it.each(['interaction', 'observation'] as const)(
    '%sは同じsource・session・revision・generation・request・tokenの応答だけを確定する',
    async (mode) => {
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

      const send = () =>
        mode === 'interaction' ? client.interact(request) : client.observe(request);
      const pending = send();
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: mode === 'interaction' ? 'javascript.interact' : 'javascript.observe',
          frameGeneration: 7,
          requestId: 'interaction-1',
          oneTimeToken: 'interaction-token-1',
          payload: mode === 'interaction' ? request.action : null,
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
        diagnostics: [],
        submitEvidence: 'unsupported',
      });
      await expect(send()).rejects.toThrow(/duplicated/u);
      client.dispose();
    },
  );

  it.each(['interaction', 'observation'] as const)(
    '%sは別generation要求を送信前に拒否しdisposeでpending要求を終了する',
    async (mode) => {
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

      const send = (request: InteractionRequest) =>
        mode === 'interaction' ? client.interact(request) : client.observe(request);
      await expect(
        send({
          exerciseSessionId: 'session-1',
          executionRevision: 1,
          frameGeneration: 8,
          requestId: 'wrong-generation',
          action: { id: 'choose', kind: 'click', selector: '#answer' },
        }),
      ).rejects.toThrow(/identity/u);
      expect(postMessage).not.toHaveBeenCalled();

      const pending = send({
        exerciseSessionId: 'session-1',
        executionRevision: 1,
        frameGeneration: 7,
        requestId: 'interaction-1',
        action: { id: 'choose', kind: 'click', selector: '#answer' },
      });
      client.dispose();
      await expect(pending).rejects.toThrow(/disposed/u);
    },
  );
});

describe('authenticated Preview interaction readiness', () => {
  it('真偽値だけをexact responseとして受理し任意値/余剰fieldを拒否する', () => {
    const envelope = (payload: unknown) => ({
      ...(interactionEnvelope() as Record<string, unknown>),
      type: 'javascript.preview-interaction-complete',
      payload,
    });
    expect(isJavaScriptRuntimeEnvelope(envelope(true))).toBe(true);
    expect(isJavaScriptRuntimeEnvelope(envelope(false))).toBe(true);
    for (const value of ['true', 1, {}, null, undefined])
      expect(isJavaScriptRuntimeEnvelope(envelope(value))).toBe(false);
    expect(isJavaScriptRuntimeEnvelope({ ...envelope(true), focused: true })).toBe(false);
  });

  it('偽造source/token/identity/旧世代と異種responseを無視し正しい応答だけを返す', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const client = new JavaScriptExecutionClient(frame, 'session-1', 1, 'token-1', {
      frameGeneration: 7,
      tokenFactory: () => 'readiness-token',
    });
    dispatchExecutionReady(frame);
    const pending = client.checkPreviewInteractionReady({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      frameGeneration: 7,
      requestId: 'ready-1',
    });
    const response = {
      ...(interactionEnvelope() as Record<string, unknown>),
      type: 'javascript.preview-interaction-complete',
      requestId: 'ready-1',
      oneTimeToken: 'readiness-token',
      payload: true,
    };
    const resolved = vi.fn();
    void pending.then(resolved);
    const send = (data: unknown, source: MessageEventSource | null = frame.contentWindow) =>
      window.dispatchEvent(new MessageEvent('message', { source, data }));
    send(response, window);
    for (const changes of [
      { oneTimeToken: 'forged' },
      { exerciseSessionId: 'other' },
      { executionRevision: 2 },
      { frameGeneration: 6 },
      { payload: 'true' },
      { type: 'javascript.interaction-complete' },
    ])
      send({ ...response, ...changes });
    send({
      ...(interactionEnvelope() as Record<string, unknown>),
      requestId: 'ready-1',
      oneTimeToken: 'readiness-token',
    });
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    send(response);
    await expect(pending).resolves.toBe(true);
    client.dispose();
  });
});
