import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserConsoleExecutionService } from './BrowserConsoleExecutionService';
import type { ExecutionRequest } from '../../../../core/runtime/contracts';

const request: ExecutionRequest = {
  runId: 'run-1',
  exerciseSessionId: 'session',
  executionRevision: 1,
  backend: 'browser',
  engine: 'browser-js',
  languageId: 'javascript',
  requiredCapabilities: ['console'],
  files: { 'script.js': 'console.log(10)' },
  options: {
    runtime: {
      kind: 'javascript',
      entryFile: 'script.js',
      sourceType: 'script',
      primaryOutput: 'console',
    },
  },
};

describe('BrowserConsoleExecutionService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('hash準備待ちでも停止がexecuteをsettleし、遅い完了からframeを作らない', async () => {
    let resolveHash: ((value: ArrayBuffer) => void) | undefined;
    vi.stubGlobal('crypto', {
      subtle: {
        digest: () =>
          new Promise<ArrayBuffer>((resolve) => {
            resolveHash = resolve;
          }),
      },
    });
    const runner = new BrowserConsoleExecutionService();
    const completed = vi.fn();
    const execution = runner.execute(request);
    void execution.then(completed);
    await Promise.resolve();
    await runner.stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ status: 'stopped' }));
    resolveHash?.(new ArrayBuffer(32));
    await Promise.resolve();
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('DOMを提供せず既知の非提供入力を実行前に返す', async () => {
    const runner = new BrowserConsoleExecutionService();
    expect(runner.environment).toMatchObject({
      backend: 'browser',
      engine: 'browser-js',
      mode: 'console',
      capabilities: ['console'],
    });
    expect('dom' in runner).toBe(false);
    expect(
      await runner.execute({ ...request, files: { 'script.js': 'new MessageChannel()' } }),
    ).toMatchObject({ status: 'unsupported', runId: 'run-1', console: [], evidence: [] });
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('DOM/module要求と環境取り違えを実行しない', async () => {
    const runner = new BrowserConsoleExecutionService();
    expect((await runner.execute({ ...request, requiredCapabilities: ['dom'] })).status).toBe(
      'unsupported',
    );
    expect(
      (await runner.execute({ ...request, options: { runtime: { sourceType: 'module' } } })).status,
    ).toBe('unsupported');
    expect((await runner.execute({ ...request, backend: 'local', engine: 'node' })).status).toBe(
      'system-error',
    );
  });
  it('解析限界をExecutionServiceの環境障害へ変換する', async () => {
    const runner = new BrowserConsoleExecutionService();
    expect(
      (await runner.execute({ ...request, files: { 'script.js': ' '.repeat(102401) } })).status,
    ).toBe('system-error');
  });
  it('停止は再利用でき、dispose後は実行を開始しない', async () => {
    const runner = new BrowserConsoleExecutionService();
    await runner.stop();
    expect((await runner.execute({ ...request, files: { 'script.js': 'fetch(1)' } })).status).toBe(
      'unsupported',
    );
    await runner.dispose();
    expect((await runner.execute(request)).status).toBe('stopped');
    expect(document.querySelector('iframe')).toBeNull();
  });
});
