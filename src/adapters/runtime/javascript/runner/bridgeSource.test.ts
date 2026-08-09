import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTrustedInteractionExecutor,
  createJavaScriptModuleExecutionSource,
  createJavaScriptExecutionSource,
  lockDownJavaScriptDynamicCodeCapabilities,
  releaseJavaScriptModuleObjectUrls,
  scrubJavaScriptBootstrapSecrets,
} from './bridgeSource';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('trusted JavaScript interaction executor', () => {
  it('捕捉済みDOM APIだけでclick・fill・select・key・focusを実行する', () => {
    document.body.innerHTML = `<button id="answer">回答</button>
      <input id="name">
      <select id="level"><option value="beginner">初級</option></select>
      <button id="next">次へ</button>`;
    const events: string[] = [];
    document.querySelector('#answer')?.addEventListener('click', () => events.push('click'));
    document.querySelector('#name')?.addEventListener('input', () => events.push('input'));
    document.querySelector('#name')?.addEventListener('change', () => events.push('change'));
    document.querySelector('#level')?.addEventListener('input', () => events.push('select-input'));
    document
      .querySelector('#level')
      ?.addEventListener('change', () => events.push('select-change'));
    document.querySelector('#next')?.addEventListener('keydown', (event) => {
      events.push(`key:${(event as KeyboardEvent).key}`);
    });
    const execute = createTrustedInteractionExecutor(document);
    vi.spyOn(document, 'querySelector').mockImplementation(() => null);

    expect(execute({ id: 'choose', kind: 'click', selector: '#answer' })).toEqual({ error: null });
    expect(execute({ id: 'fill-name', kind: 'fill', selector: '#name', value: 'つむ' })).toEqual({
      error: null,
    });
    expect(
      execute({ id: 'select-level', kind: 'select', selector: '#level', value: 'beginner' }),
    ).toEqual({ error: null });
    expect(execute({ id: 'submit-key', kind: 'key', selector: '#next', key: 'Enter' })).toEqual({
      error: null,
    });
    expect(execute({ id: 'focus-next', kind: 'focus', selector: '#next' })).toEqual({
      error: null,
    });

    expect((document.getElementById('name') as HTMLInputElement).value).toBe('つむ');
    expect((document.getElementById('level') as HTMLSelectElement).value).toBe('beginner');
    expect(document.activeElement).toBe(document.getElementById('next'));
    expect(events).toEqual([
      'click',
      'input',
      'change',
      'select-input',
      'select-change',
      'key:Enter',
    ]);
  });

  it('未知field・対象不在・actionと対象型の不一致をbounded errorへ変換する', () => {
    document.body.innerHTML =
      '<button id="answer">回答</button><div id="plain"></div><input id="clear" value="before">';
    const execute = createTrustedInteractionExecutor(document);

    expect(execute({ id: 'clear', kind: 'fill', selector: '#clear', value: '' })).toEqual({
      error: null,
    });
    expect((document.getElementById('clear') as HTMLInputElement).value).toBe('');

    expect(execute({ id: 'choose', kind: 'click', selector: '#answer', sleepMs: 100 })).toEqual({
      error: { code: 'invalid-action', message: 'Interaction action is invalid' },
    });
    expect(execute({ id: 'missing', kind: 'click', selector: '#missing' })).toEqual({
      error: { code: 'target-not-found', message: 'Interaction target was not found' },
    });
    expect(execute({ id: 'fill', kind: 'fill', selector: '#plain', value: 'x' })).toEqual({
      error: { code: 'target-type-mismatch', message: 'Interaction target type is invalid' },
    });
  });
});

describe('JavaScript Module Blob lifecycle', () => {
  it('trusted bootstrapが捕捉した後は学習globalからBlob生成Capabilityを除去する', () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    const FakeBlob = vi.fn();
    const target = {
      Blob: FakeBlob,
      Reflect: { construct: vi.fn() },
      URL: { createObjectURL, revokeObjectURL: vi.fn() },
    };

    lockDownJavaScriptDynamicCodeCapabilities(target);

    expect(target.Blob).toBeUndefined();
    expect(target.Reflect).toBeUndefined();
    expect(target.URL).toBeUndefined();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('1件のrevoke失敗後も全URLを回収し、二度目は何もしない', () => {
    const objectUrls = ['blob:first', 'blob:throws', 'blob:last'];
    const revoked: string[] = [];
    const revoke = vi.fn((url: string) => {
      revoked.push(url);
      if (url === 'blob:throws') throw new Error('browser revoke failure');
    });

    releaseJavaScriptModuleObjectUrls(objectUrls, revoke);
    releaseJavaScriptModuleObjectUrls(objectUrls, revoke);

    expect(revoked).toEqual(['blob:last', 'blob:throws', 'blob:first']);
    expect(objectUrls).toEqual([]);
    expect(revoke).toHaveBeenCalledTimes(3);
  });

  it('成功・import失敗の両方をfinally cleanupへ結び、runtime globalも削除する', () => {
    const source = createJavaScriptModuleExecutionSource({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      frameGeneration: 7,
      bootstrapToken: 'token-1',
      runtimeKey: '__tsumuRuntime_1',
      moduleGraph: {
        entryFile: 'main.js',
        graphSha256: 'a'.repeat(64),
        modules: [
          {
            file: 'main.js',
            sourceSegments: ['console.log("ready");'],
            dependencyFiles: [],
          },
        ],
      },
    });

    expect(source).toContain('.finally(() =>');
    expect(source).toContain('releaseObjectUrls(objectUrls,revokeObjectUrl)');
    expect(source).toContain('delete globalThis["__tsumuRuntime_1"]');
  });

  it('実行前にCSP metaと全script nodeをDOMから除去する', () => {
    document.head.innerHTML = `<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-secret'">
      <script nonce="secret"></script>`;
    document.body.innerHTML = '<script nonce="secret"></script>';

    scrubJavaScriptBootstrapSecrets(document);

    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')).toBeNull();
    expect(document.scripts).toHaveLength(0);
  });

  it('lockdown後のtimer callbackはglobal Reflectへ依存しない', () => {
    const source = createJavaScriptExecutionSource({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      frameGeneration: 7,
      bootstrapToken: 'token-1',
      guardIdentifier: '__tsumuGuard_1',
      instrumentedCode: 'setTimeout(() => console.log("ready"), 0);',
    });

    expect(source).toContain('const applyFunction = Reflect.apply.bind(Reflect);');
    expect(source).toContain('applyFunction(callback, thisValue, args)');
    expect(source).toContain('installEventListenerGuards();');
    expect(source).toContain('learnerExecutionDepth === 0 && functionDepth === 0');
    expect(source).toContain('const maximumFunctionDepth = 32;');
    expect(source).toContain('functionDepth > maximumFunctionDepth');
    expect(source).toContain('const objectKeys = Object.keys.bind(Object);');
    expect(source).toContain('const keys = objectKeys(message).sort();');
  });
});
