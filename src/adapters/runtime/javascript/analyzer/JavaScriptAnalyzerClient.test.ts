import { describe, expect, it, vi } from 'vitest';
import type {
  AnalyzerWorkerPort,
  JavaScriptAnalysisRequest,
  JavaScriptAnalysisSuccess,
} from './contracts';
import { JavaScriptAnalyzerClient } from './JavaScriptAnalyzerClient';

class FakeWorker implements AnalyzerWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly postMessage = vi.fn<(message: unknown) => void>();
  readonly terminate = vi.fn<() => void>();

  /** TestからWorker responseを同期送信する。 */
  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

const input = {
  exerciseSessionId: 'javascript:exercise-1',
  executionRevision: 4,
  file: 'script.js',
  source: 'const value = 1;',
  guardIdentifier: '__tsumuBudget',
} as const;

/** Workerへ送られたrequestとidentityが一致する成功responseを作る。 */
function success(request: JavaScriptAnalysisRequest): JavaScriptAnalysisSuccess {
  return {
    status: 'success',
    requestId: request.requestId,
    exerciseSessionId: request.exerciseSessionId,
    executionRevision: request.executionRevision,
    file: request.file,
    instrumentedCode: request.source,
    sourceSha256: 'a'.repeat(64),
    facts: [],
    diagnostics: [],
  };
}

describe('JavaScriptAnalyzerClient', () => {
  it('同じrequest identityの一度目のresponseだけを受理する', async () => {
    const worker = new FakeWorker();
    const client = new JavaScriptAnalyzerClient({
      workerFactory: () => worker,
      requestIdFactory: () => 'request-1',
      deadlineMs: 500,
    });
    const pending = client.analyze(input);
    const message = worker.postMessage.mock.calls[0]?.[0] as {
      type: 'analyze';
      request: JavaScriptAnalysisRequest;
    };

    let settled = false;
    void pending.finally(() => {
      settled = true;
    });
    worker.emit({ type: 'result', result: { ...success(message.request), unexpected: true } });
    await Promise.resolve();
    expect(settled).toBe(false);

    worker.emit({
      type: 'result',
      result: { ...success(message.request), executionRevision: 3 },
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    worker.emit({ type: 'result', result: success(message.request) });
    await expect(pending).resolves.toEqual(success(message.request));
    worker.emit({ type: 'result', result: success(message.request) });
    worker.emit({ type: 'result', result: { ...success(message.request), requestId: 'unknown' } });
    expect(worker.terminate).not.toHaveBeenCalled();
    await client.dispose();
  });

  it('deadlineでWorkerを破棄してsystem diagnosticを返し、次回は新Workerを使う', async () => {
    vi.useFakeTimers();
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const workers = [firstWorker, secondWorker];
    const client = new JavaScriptAnalyzerClient({
      workerFactory: () => {
        const worker = workers.shift();
        if (worker === undefined) throw new Error('Worker fixtureが足りません');
        return worker;
      },
      requestIdFactory: vi.fn().mockReturnValueOnce('request-1').mockReturnValueOnce('request-2'),
      deadlineMs: 500,
    });

    const timedOut = client.analyze(input);
    await vi.advanceTimersByTimeAsync(500);
    await expect(timedOut).resolves.toMatchObject({
      status: 'failure',
      diagnostics: [expect.objectContaining({ kind: 'system' })],
    });
    expect(firstWorker.terminate).toHaveBeenCalledOnce();

    const retried = client.analyze({ ...input, executionRevision: 5 });
    const message = secondWorker.postMessage.mock.calls[0]?.[0] as {
      type: 'analyze';
      request: JavaScriptAnalysisRequest;
    };
    secondWorker.emit({ type: 'result', result: success(message.request) });
    await expect(retried).resolves.toMatchObject({ status: 'success', executionRevision: 5 });
    await client.dispose();
    vi.useRealTimers();
  });

  it('dispose後はpendingをAbortErrorにし、新しい解析を拒否する', async () => {
    const worker = new FakeWorker();
    const client = new JavaScriptAnalyzerClient({
      workerFactory: () => worker,
      requestIdFactory: () => 'request-1',
      deadlineMs: 500,
    });
    const pending = client.analyze(input);

    await client.dispose();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(client.analyze(input)).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('一度使ったrequest IDを再利用せず、postMessage失敗をsystem diagnosticへ変換する', async () => {
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    secondWorker.postMessage.mockImplementation(() => {
      throw new Error('clone failed');
    });
    const workers = [firstWorker, secondWorker];
    const client = new JavaScriptAnalyzerClient({
      workerFactory: () => {
        const worker = workers.shift();
        if (worker === undefined) throw new Error('Worker fixtureが足りません');
        return worker;
      },
      requestIdFactory: () => 'request-1',
      deadlineMs: 500,
    });
    const first = client.analyze(input);
    const firstMessage = firstWorker.postMessage.mock.calls[0]?.[0] as {
      type: 'analyze';
      request: JavaScriptAnalysisRequest;
    };
    firstWorker.emit({ type: 'result', result: success(firstMessage.request) });
    await expect(first).resolves.toMatchObject({ status: 'success' });

    await expect(client.analyze({ ...input, executionRevision: 5 })).rejects.toThrow(/request ID/u);
    await client.dispose();

    const postMessageClient = new JavaScriptAnalyzerClient({
      workerFactory: () => secondWorker,
      requestIdFactory: () => 'request-2',
      deadlineMs: 500,
    });
    await expect(postMessageClient.analyze(input)).resolves.toMatchObject({
      status: 'failure',
      diagnostics: [expect.objectContaining({ kind: 'system' })],
    });
    expect(secondWorker.terminate).toHaveBeenCalledOnce();
    await postMessageClient.dispose();
  });
});
