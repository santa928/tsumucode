import { describe, expect, it, vi } from 'vitest';
import { sanitizeHtml } from '../../preview-kernel/sanitizeHtml';
import { createJavaScriptSrcdoc } from './createJavaScriptSrcdoc';
import { createJavaScriptExecutionSource } from './bridgeSource';
import { JAVASCRIPT_PROTOCOL_VERSION } from './protocol';

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
    runtimeSource:
      'document.querySelector("#message").textContent = "変更後";' +
      'const closingTag = "</script><img id=\\"escaped-runtime\\">";',
  });
}

describe('createJavaScriptSrcdoc', () => {
  it('nonce付きBridgeとiframe内runtime loaderだけを許可し、学習HTMLの実行経路を除去する', () => {
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
    expect(scripts[1]?.getAttribute('nonce')).toBe('nonce123');
    expect(scripts[1]?.hasAttribute('src')).toBe(false);
    expect(scripts[1]?.hasAttribute('data-tsumucode-javascript-runtime')).toBe(true);
    expect(scripts[1]?.textContent).toContain('URL.createObjectURL');
    expect(scripts[1]?.textContent).toContain('URL.revokeObjectURL');
    expect(scripts[1]?.textContent).toContain('revokeObjectUrl(objectUrl)');
    expect(scripts[1]?.textContent).not.toContain('</script>');
    expect(parsed.querySelector('#escaped-runtime')).toBeNull();
    expect(srcdoc).toContain('const objectKeys = Object.keys.bind(Object);');
    expect(srcdoc).toContain('const objectFromEntries = Object.fromEntries.bind(Object);');
  });

  it('runtime sourceが上限を超える場合はsrcdocを生成しない', () => {
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
        runtimeSource: 'x'.repeat(1024 * 1024 + 1),
      }),
    ).toThrow('JavaScript runtime source exceeds srcdoc limit');
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
        version: JAVASCRIPT_PROTOCOL_VERSION,
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
          console: [],
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
    const dispatchWindowEvent = childWindow.dispatchEvent.bind(childWindow);
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
        version: JAVASCRIPT_PROTOCOL_VERSION,
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
          console: [],
        },
      });
      dispatchWindowEvent(
        new MessageEvent('message', {
          source: childWindow.parent,
          data: {
            version: JAVASCRIPT_PROTOCOL_VERSION,
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

  it('Consoleをplain textで保持し、runtime error前のrecordも失わない', async () => {
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
        executionRevision: 5,
        bootstrapToken: 'bootstrap-token',
        guardIdentifier: '__tsumuBudgetGuard',
        instrumentedCode: [
          'const cyclic = {}; cyclic.self = cyclic;',
          'let getterCalls = 0;',
          'const guarded = Object.defineProperty({}, "secret", { enumerable: true, get() { getterCalls += 1; return "leaked"; } });',
          'Array.prototype.push = () => { throw new Error("learner push mutation"); };',
          'Array.prototype.map = () => { throw new Error("learner map mutation"); };',
          'TextEncoder.prototype.encode = () => { throw new Error("learner encoder mutation"); };',
          'console.log(1, "x", true, null);',
          'console.info({ markup: "<b>plain</b>" });',
          'console.warn(cyclic);',
          'console.error(guarded);',
          'document.body.dataset.getterCalls = String(getterCalls);',
          'throw new Error("stop here");',
        ].join('\n'),
      });
      childWindow.document.open();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- parser実行順を再現するiframe test fixture。
      childWindow.document.write(
        `<!doctype html><html><body><script>${source}</script></body></html>`,
      );
      childWindow.document.close();

      await Promise.resolve();
      expect(childWindow.document.body.dataset.getterCalls).toBe('0');
      expect(messages).toContainEqual({
        version: JAVASCRIPT_PROTOCOL_VERSION,
        type: 'javascript.execution-complete',
        exerciseSessionId: 'session-1',
        executionRevision: 5,
        requestId: 'execution',
        oneTimeToken: 'bootstrap-token',
        payload: {
          executed: false,
          budgetExhausted: false,
          timerLimitExceeded: false,
          runtimeError: { name: 'Error', message: 'stop here' },
          console: [
            { sequence: 0, level: 'log', text: '1 x true null' },
            { sequence: 1, level: 'info', text: '{markup: "<b>plain</b>"}' },
            { sequence: 2, level: 'warn', text: '{self: [Circular]}' },
            { sequence: 3, level: 'error', text: '{secret: [Unreadable]}' },
          ],
        },
      });
    } finally {
      postMessage.mockRestore();
      frame.remove();
    }
  });

  it('Console floodを100件以内に収め、最後を上限warningへ置き換える', async () => {
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
        executionRevision: 6,
        bootstrapToken: 'bootstrap-token',
        guardIdentifier: '__tsumuBudgetGuard',
        instrumentedCode: 'for (let index = 0; index < 105; index += 1) console.log(index);',
      });
      childWindow.document.open();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- parser実行順を再現するiframe test fixture。
      childWindow.document.write(
        `<!doctype html><html><body><script>${source}</script></body></html>`,
      );
      childWindow.document.close();

      await Promise.resolve();
      const envelope = messages.find(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          (message as Readonly<Record<string, unknown>>).type === 'javascript.execution-complete',
      ) as { readonly payload: { readonly console: readonly unknown[] } } | undefined;
      expect(envelope?.payload.console).toHaveLength(100);
      expect(envelope?.payload.console.at(-1)).toEqual({
        sequence: 99,
        level: 'warn',
        text: 'Console output limit reached',
      });
    } finally {
      postMessage.mockRestore();
      frame.remove();
    }
  });
});
