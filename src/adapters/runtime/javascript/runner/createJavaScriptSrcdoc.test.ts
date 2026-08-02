import { describe, expect, it, vi } from 'vitest';
import { sanitizeHtml } from '../../preview-kernel/sanitizeHtml';
import { createJavaScriptSrcdoc } from './createJavaScriptSrcdoc';
import { createJavaScriptExecutionSource } from './bridgeSource';

/** JavaScript Preview用の安全なsrcdocを既定値から組み立てる。 */
function createSrcdoc(): string {
  const sanitized = sanitizeHtml(
    '<main onclick="fetch(\'https://evil.example\')"><p id="message">変更前</p>' +
      '<script>parent.postMessage("stolen", "*")</script></main>',
    [],
  );
  return createJavaScriptSrcdoc({
    sanitizedDocument: sanitized.document,
    css: 'main { color: green; }',
    nonce: 'nonce123',
    bootstrapToken: 'bootstrap-token',
    exerciseSessionId: 'session-1',
    executionRevision: 3,
    viewport: { id: 'desktop', width: 1280, height: 720 },
    runtimeUrl: 'blob:https://example.test/runtime',
  });
}

describe('createJavaScriptSrcdoc', () => {
  it('nonce付きBridgeと検証済みblob runtimeだけを許可し、学習HTMLの実行経路を除去する', () => {
    const srcdoc = createSrcdoc();
    const parsed = new DOMParser().parseFromString(srcdoc, 'text/html');
    const csp = parsed.head.firstElementChild?.getAttribute('content') ?? '';
    const scripts = [...parsed.querySelectorAll('script')];

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("worker-src 'none'");
    expect(csp).toContain("script-src 'nonce-nonce123' blob:");
    expect(srcdoc).not.toContain('allow-same-origin');
    expect(srcdoc).not.toContain('evil.example');
    expect(parsed.querySelector('main')?.hasAttribute('onclick')).toBe(false);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]?.getAttribute('nonce')).toBe('nonce123');
    expect(scripts[1]?.getAttribute('src')).toBe('blob:https://example.test/runtime');
    expect(scripts[1]?.hasAttribute('nonce')).toBe(false);
  });

  it('runtime URLは親Documentで生成したblob URLだけを受理する', () => {
    const sanitized = sanitizeHtml('<main>安全</main>', []);

    expect(() =>
      createJavaScriptSrcdoc({
        sanitizedDocument: sanitized.document,
        css: '',
        nonce: 'nonce123',
        bootstrapToken: 'bootstrap-token',
        exerciseSessionId: 'session-1',
        executionRevision: 1,
        viewport: { id: 'desktop', width: 1280, height: 720 },
        runtimeUrl: 'https://evil.example/runtime.js',
      }),
    ).toThrow('Invalid JavaScript runtime URL');
  });
});

describe('createJavaScriptExecutionSource', () => {
  it('Loop budgetを例外なしで停止し、budget超過を認証済みmessageで報告する', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const childWindow = frame.contentWindow!;
    const messages: unknown[] = [];
    const postMessage = vi
      .spyOn(childWindow.parent, 'postMessage')
      .mockImplementation((message) => {
        messages.push(message);
      });
    try {
      const source = createJavaScriptExecutionSource({
        exerciseSessionId: 'session-1',
        executionRevision: 3,
        bootstrapToken: 'bootstrap-token',
        guardIdentifier: '__tsumuBudgetGuard',
        instrumentedCode: 'while (true) { if (!__tsumuBudgetGuard.checkLoop()) break; }',
      });
      childWindow.document.open();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- parser実行順を再現するiframe test fixture。
      childWindow.document.write(
        `<!doctype html><html><body><script>${source}</script></body></html>`,
      );
      childWindow.document.close();

      await Promise.resolve();
      expect(messages).toContainEqual({
        version: 1,
        type: 'javascript.execution-complete',
        exerciseSessionId: 'session-1',
        executionRevision: 3,
        requestId: 'execution',
        oneTimeToken: 'bootstrap-token',
        payload: {
          executed: true,
          budgetExhausted: true,
          timerLimitExceeded: false,
          runtimeError: null,
        },
      });
    } finally {
      postMessage.mockRestore();
      frame.remove();
    }
  });

  it('危険なglobal APIを無効化し、timerを10件で打ち止めにする', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const childWindow = frame.contentWindow!;
    const messages: unknown[] = [];
    const postMessage = vi
      .spyOn(childWindow.parent, 'postMessage')
      .mockImplementation((message) => {
        messages.push(message);
      });
    try {
      const source = createJavaScriptExecutionSource({
        exerciseSessionId: 'session-1',
        executionRevision: 4,
        bootstrapToken: 'bootstrap-token',
        guardIdentifier: '__tsumuBudgetGuard',
        instrumentedCode: [
          'document.body.dataset.fetchType = typeof fetch;',
          'document.body.dataset.workerType = typeof Worker;',
          'for (let index = 0; index < 11; index += 1) {',
          '  setTimeout(() => undefined, 100000);',
          '}',
        ].join('\n'),
      });
      childWindow.document.open();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- parser実行順を再現するiframe test fixture。
      childWindow.document.write(
        `<!doctype html><html><body><script>${source}</script></body></html>`,
      );
      childWindow.document.close();

      await Promise.resolve();
      expect(childWindow.document.body.dataset).toMatchObject({
        fetchType: 'undefined',
        workerType: 'undefined',
      });
      expect(messages).toContainEqual({
        version: 1,
        type: 'javascript.execution-complete',
        exerciseSessionId: 'session-1',
        executionRevision: 4,
        requestId: 'execution',
        oneTimeToken: 'bootstrap-token',
        payload: {
          executed: true,
          budgetExhausted: false,
          timerLimitExceeded: true,
          runtimeError: null,
        },
      });
      childWindow.dispatchEvent(
        new MessageEvent('message', {
          source: childWindow.parent,
          data: {
            version: 1,
            type: 'javascript.clear-timers',
            exerciseSessionId: 'session-1',
            executionRevision: 4,
            requestId: 'clear-1',
            oneTimeToken: 'clear-token',
            payload: null,
          },
        }),
      );
      expect(messages).toContainEqual(
        expect.objectContaining({
          type: 'javascript.timers-cleared',
          requestId: 'clear-1',
          oneTimeToken: 'clear-token',
        }),
      );
    } finally {
      postMessage.mockRestore();
      frame.remove();
    }
  });
});
