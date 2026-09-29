import { describe, expect, it, vi } from 'vitest';
import { BrowserExecutionService } from '../../../src/core/runtime/BrowserExecutionService';
import type {
  ExecutionRequest,
  RunnerAdapter,
  RunnerRenderResult,
} from '../../../src/core/runtime/contracts';

const request: ExecutionRequest = {
  runId: 'run-1',
  exerciseSessionId: 'session',
  executionRevision: 1,
  backend: 'browser',
  engine: 'browser-js',
  languageId: 'javascript',
  files: { 'script.js': 'console.log(1)' },
  options: {},
  requiredCapabilities: ['console'],
  presentation: { assets: [], viewport: { id: 'desktop', width: 1280, height: 720 } },
};

/** 実行遅延と停止を制御し、表示DOMを生成しない境界fixture。 */
function harness() {
  const result: RunnerRenderResult = {
    exerciseSessionId: 'session',
    executionRevision: 1,
    diagnostics: [],
    evidence: [],
    console: [],
  };
  const runner = {
    languageId: 'javascript',
    prepare: vi.fn(async (): Promise<void> => undefined),
    render: vi.fn(async () => result),
    requestSnapshot: vi.fn(async () => {
      throw new Error('snapshot must not be called');
    }),
    stop: vi.fn(async (): Promise<void> => undefined),
    dispose: vi.fn(async () => undefined),
  } satisfies RunnerAdapter;
  return { runner, result, service: new BrowserExecutionService(runner) };
}

describe('BrowserExecutionService', () => {
  it('prepare待機中の停止はRunnerを最終破棄せず、次のprepareで再利用できる', async () => {
    const { runner, service } = harness();
    const frame = document.createElement('iframe');
    let finish!: () => void;
    runner.prepare.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const preparing = service.dom.prepare(frame);
    const rejected = expect(preparing).rejects.toThrow('disposed');
    await vi.waitFor(() => {
      expect(runner.prepare).toHaveBeenCalledOnce();
    });
    await service.stop();
    finish();
    await rejected;
    expect(runner.dispose).not.toHaveBeenCalled();
    expect(runner.stop).toHaveBeenCalledTimes(2);
    await service.dom.prepare(frame);
    expect(await service.execute(request)).toMatchObject({ status: 'succeeded' });
  });

  it('prepare待機中の離脱後はframeを復活させない', async () => {
    const { runner, service } = harness();
    let finish!: () => void;
    runner.prepare.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const preparing = service.dom.prepare(document.createElement('iframe'));
    const rejected = expect(preparing).rejects.toThrow('disposed');
    await vi.waitFor(() => {
      expect(runner.prepare).toHaveBeenCalledOnce();
    });
    await service.dispose();
    finish();
    await rejected;
    expect(await service.execute(request)).toMatchObject({ status: 'stopped' });
    expect(runner.render).not.toHaveBeenCalled();
    expect(runner.dispose).toHaveBeenCalledTimes(2);
  });

  it('同じrevisionの新旧runと停止後の遅延応答を混同しない', async () => {
    const { runner, result, service } = harness();
    let finish!: (result: RunnerRenderResult) => void;
    vi.mocked(runner.render).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const old = service.execute(request);
    await vi.waitFor(() => {
      expect(runner.render).toHaveBeenCalledOnce();
    });
    const current = await service.execute({ ...request, runId: 'run-2' });
    finish(result);
    expect(await old).toMatchObject({ runId: 'run-1', status: 'stopped' });
    expect(current).toMatchObject({ runId: 'run-2', status: 'succeeded', backend: 'browser' });
    expect(current).not.toHaveProperty('passed');

    vi.mocked(runner.render).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = service.execute({ ...request, runId: 'run-3' });
    await vi.waitFor(() => {
      expect(runner.render).toHaveBeenCalledTimes(3);
    });
    await service.stop();
    expect(await pending).toMatchObject({ runId: 'run-3', status: 'stopped' });
    finish(result);
    expect(runner.stop).toHaveBeenCalledOnce();
    expect(runner.dispose).not.toHaveBeenCalled();
  });

  it('停止の完了を待って同じframeを再準備し、最終破棄だけがRunnerをdisposeする', async () => {
    const { runner, service } = harness();
    const frame = document.createElement('iframe');
    await service.dom.prepare(frame);
    let finishStop!: () => void;
    runner.stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
    );
    const stopping = service.stop();
    const next = service.execute({ ...request, runId: 'after-reset' });
    await vi.waitFor(() => {
      expect(runner.stop).toHaveBeenCalledOnce();
    });
    expect(runner.prepare).toHaveBeenCalledOnce();
    expect(runner.render).not.toHaveBeenCalled();
    expect(runner.dispose).not.toHaveBeenCalled();
    finishStop();
    await stopping;
    expect(await next).toMatchObject({ runId: 'after-reset', status: 'succeeded' });
    expect(runner.prepare).toHaveBeenCalledTimes(2);
    expect(runner.prepare).toHaveBeenLastCalledWith(frame);
    await service.dispose();
    await service.dispose();
    expect(runner.dispose).toHaveBeenCalledOnce();
    expect(await service.execute(request)).toMatchObject({ status: 'stopped' });
  });

  it('環境identityの不一致と破棄後の実行を拒否する', async () => {
    const { runner, service } = harness();
    expect(await service.execute({ ...request, backend: 'local', engine: 'node' })).toMatchObject({
      status: 'system-error',
    });
    expect(runner.render).not.toHaveBeenCalled();
    await service.dispose();
    expect(await service.execute(request)).toMatchObject({ status: 'stopped' });
    expect(runner.render).not.toHaveBeenCalled();
  });
});

describe('TypeScriptの実行前診断', () => {
  it('型検査失敗はtype-error、実行時のreference診断はcode-errorとして区別する', async () => {
    const { runner, result, service } = harness();
    const diagnostic = {
      code: 'typescript-type-error-2322',
      kind: 'reference' as const,
      severity: 'error' as const,
      message: 'Type mismatch',
      learnerMessage: '型を確認してください',
      file: 'main.ts',
      line: 1,
    };
    runner.render.mockResolvedValueOnce({ ...result, diagnostics: [diagnostic] });
    expect(await service.execute(request)).toMatchObject({ status: 'type-error', evidence: [] });
    runner.render.mockResolvedValueOnce({
      ...result,
      diagnostics: [{ ...diagnostic, code: 'javascript-runtime' }],
    });
    expect(await service.execute(request)).toMatchObject({ status: 'code-error' });
  });
});
