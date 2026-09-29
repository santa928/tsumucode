import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TypeScriptCompilerClient,
  type CompilerWorkerPort,
} from '../../../src/adapters/runtime/typescript/TypeScriptCompilerClient';
import type { CompilerWorkerRequest } from '../../../src/adapters/runtime/typescript/workerContract';

/** Workerを走らせず、遅延・古い応答・基盤故障だけを再現する契約用port。 */
class FakeWorker implements CompilerWorkerPort {
  onmessage: CompilerWorkerPort['onmessage'] = null;
  onerror: CompilerWorkerPort['onerror'] = null;
  onmessageerror: CompilerWorkerPort['onmessageerror'] = null;
  request: CompilerWorkerRequest | undefined;
  terminate = vi.fn();
  postMessage(request: CompilerWorkerRequest): void {
    this.request = request;
  }
  /** 通常の応答identityを再現し、改変した応答も注入する。 */
  respond(overrides: Record<string, unknown> = {}): void {
    this.onmessage?.({
      data: {
        requestId: this.request?.requestId,
        sessionId: this.request?.input.sessionId,
        revision: this.request?.input.revision,
        result: {
          status: 'ready',
          files: { 'main.js': 'const count = 1;' },
          sourceMaps: { 'main.js': '{}' },
        },
        ...overrides,
      },
    } as MessageEvent<unknown>);
  }
}

const input = {
  sessionId: 'lesson-ts',
  revision: 1,
  files: { 'main.ts': 'const count: number = 1;' },
};
afterEach(() => {
  vi.useRealTimers();
});

describe('TypeScriptCompilerClient', () => {
  it('初回要求までWorkerを作らず、元sourceを保持し同identityの応答だけ受理する', async () => {
    const worker = new FakeWorker();
    const factory = vi.fn(() => worker);
    const client = new TypeScriptCompilerClient({ workerFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    const source = { ...input, files: { ...input.files } };
    const result = client.compile(source);
    source.files['main.ts'] = '編集後';
    expect(worker.request?.input.files['main.ts']).toBe(input.files['main.ts']);
    worker.respond({ revision: 0 });
    worker.respond({ sessionId: 'another-session' });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.respond();
    await expect(result).resolves.toMatchObject({ status: 'ready' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it('新要求は旧Workerを中止し、旧callbackは新要求へ影響しない', async () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    const client = new TypeScriptCompilerClient({ workerFactory: () => workers.shift()! });
    const firstWorker = workers[0]!;
    const secondWorker = workers[1]!;
    const first = client.compile(input).catch((error: unknown) => error);
    const lateError = firstWorker.onerror;
    const second = client.compile({ ...input, revision: 2 });
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    expect(await first).toMatchObject({ name: 'AbortError' });
    lateError?.({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    expect(secondWorker.terminate).not.toHaveBeenCalled();
    secondWorker.respond();
    await expect(second).resolves.toMatchObject({ status: 'ready' });
  });

  it('時間切れはWorkerをterminateして環境障害にし、新Workerで再試行できる', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker, deadlineMs: 50 });
    const result = client.compile(input);
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toMatchObject({ status: 'environment-error' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const retry = client.compile(input);
    worker.respond();
    await expect(retry).resolves.toMatchObject({ status: 'ready' });
  });

  it('中止/離脱はAbortErrorで終わり、離脱後の要求を起動しない', async () => {
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
    const pending = client.compile(input).catch((error: unknown) => error);
    client.cancel();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    client.dispose();
    client.dispose();
    await expect(client.compile(input)).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('Worker作成/転送/復号失敗と不正な出力を環境障害に分離する', async () => {
    const creation = new TypeScriptCompilerClient({
      workerFactory: () => {
        throw new Error('unavailable');
      },
    });
    await expect(creation.compile(input)).resolves.toMatchObject({ status: 'environment-error' });
    const worker = new FakeWorker();
    const client = new TypeScriptCompilerClient({ workerFactory: () => worker });
    const invalid = client.compile(input);
    worker.respond({
      result: {
        status: 'ready',
        files: { '../other.js': 'invalid' },
        sourceMaps: { 'main.js': '{}' },
      },
    });
    await expect(invalid).resolves.toMatchObject({ status: 'environment-error' });
    for (const sourceMaps of [
      undefined,
      { 'other.js': '{}' },
      { 'main.js': 'x'.repeat(4_194_305) },
    ]) {
      const invalidMap = client.compile(input);
      worker.respond({
        result: { status: 'ready', files: { 'main.js': 'console.log(1);' }, sourceMaps },
      });
      await expect(invalidMap).resolves.toMatchObject({ status: 'environment-error' });
    }
    const mixed = client.compile(input);
    worker.respond({
      result: {
        status: 'type-error',
        diagnostics: [{ code: 1, message: '型不一致' }],
        files: { 'main.js': 'unexpected' },
      },
    });
    await expect(mixed).resolves.toMatchObject({ status: 'environment-error' });
    const decode = client.compile(input);
    worker.onmessageerror?.({} as MessageEvent<unknown>);
    await expect(decode).resolves.toMatchObject({ status: 'environment-error' });
    worker.postMessage = () => {
      throw new Error('clone');
    };
    await expect(client.compile(input)).resolves.toMatchObject({ status: 'environment-error' });
  });

  it('不正な新入力でも旧計算を中止し、Workerへ渡さない', async () => {
    const worker = new FakeWorker();
    const factory = vi.fn(() => worker);
    const client = new TypeScriptCompilerClient({ workerFactory: factory });
    const previous = client.compile(input).catch((error: unknown) => error);
    await expect(
      client.compile({ ...input, files: { '../outside.ts': '' } }),
    ).resolves.toMatchObject({ status: 'invalid-input' });
    expect(await previous).toMatchObject({ name: 'AbortError' });
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
