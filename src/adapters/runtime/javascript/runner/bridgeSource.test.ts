import { describe, expect, it, vi } from 'vitest';
import {
  createJavaScriptModuleExecutionSource,
  createJavaScriptExecutionSource,
  lockDownJavaScriptDynamicCodeCapabilities,
  releaseJavaScriptModuleObjectUrls,
  scrubJavaScriptBootstrapSecrets,
} from './bridgeSource';

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
