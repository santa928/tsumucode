import { describe, expect, it } from 'vitest';
import type { RunnerConsoleRecord } from '../../../../core/runtime/contracts';
import { JAVASCRIPT_PROTOCOL_VERSION, isJavaScriptRuntimeEnvelope } from './protocol';

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
});
