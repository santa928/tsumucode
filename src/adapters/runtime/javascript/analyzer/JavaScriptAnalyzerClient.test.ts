import { describe, expect, it, vi } from 'vitest';
import type {
  AnalyzerWorkerPort,
  JavaScriptAnalysisRequest,
  JavaScriptLegacyAnalysisSuccess,
  JavaScriptWorkspaceAnalysisRequest,
  JavaScriptWorkspaceAnalysisSuccess,
} from './contracts';
import { isAnalyzerWorkerResponse, isJavaScriptAnalysisRequest } from './contracts';
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
  sourceType: 'script',
  capabilityProfile: 'core',
  guardIdentifier: '__tsumuBudget',
} as const;

const workspaceInput = {
  exerciseSessionId: 'javascript:exercise-1',
  executionRevision: 4,
  entryFile: 'src/main.js',
  files: {
    'src/main.js': "import { score } from './score.js'; console.log(score);",
    'src/score.js': 'export const score = 1;',
  },
  sourceType: 'module',
  capabilityProfile: 'modules',
  guardIdentifier: '__tsumuBudget',
} as const;

/** Workerへ送られたrequestとidentityが一致する成功responseを作る。 */
function success(request: JavaScriptAnalysisRequest): JavaScriptLegacyAnalysisSuccess {
  if ('files' in request) throw new Error('classic requestではありません');
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

/** Workspace requestと同じidentityのmodule graph responseを作る。 */
function workspaceSuccess(
  request: JavaScriptWorkspaceAnalysisRequest,
): JavaScriptWorkspaceAnalysisSuccess {
  return {
    status: 'success',
    requestId: request.requestId,
    exerciseSessionId: request.exerciseSessionId,
    executionRevision: request.executionRevision,
    file: request.entryFile,
    entryFile: request.entryFile,
    graphSha256: 'b'.repeat(64),
    modules: [
      {
        file: 'src/score.js',
        instrumentedCode: 'export const score = 1;',
        dependencies: [],
      },
      {
        file: 'src/main.js',
        instrumentedCode: "import { score } from './score.js'; console.log(score);",
        dependencies: [
          {
            specifier: './score.js',
            resolvedFile: 'src/score.js',
            start: 22,
            end: 34,
          },
        ],
      },
    ],
    facts: [],
    diagnostics: [],
  };
}

describe('JavaScriptAnalyzerClient', () => {
  it('Worker requestはentryとWorkspace全体をstrictに受理する', () => {
    const request = {
      exerciseSessionId: 'javascript:exercise-1',
      executionRevision: 4,
      entryFile: 'src/main.js',
      files: {
        'src/main.js': "import { score } from './score.js'; console.log(score);",
        'src/score.js': 'export const score = 1;',
      },
      sourceType: 'module',
      capabilityProfile: 'modules',
      guardIdentifier: '__tsumuBudget',
      requestId: 'request-workspace',
    } as const;

    expect(isJavaScriptAnalysisRequest(request)).toBe(true);
    expect(
      isJavaScriptAnalysisRequest({
        ...request,
        files: { ...request.files, '../outside.js': 'export const secret = true;' },
      }),
    ).toBe(false);
    expect(
      isJavaScriptAnalysisRequest({
        ...request,
        files: { ...request.files, 'src/data.json': '{}' },
      }),
    ).toBe(false);
    expect(
      isJavaScriptAnalysisRequest({
        ...request,
        files: { ...request.files, 'https://example.com/evil.js': 'export const evil = true;' },
      }),
    ).toBe(false);
    expect(
      isJavaScriptAnalysisRequest({
        ...request,
        files: { ...request.files, 'src/%2e%2e/evil.js': 'export const evil = true;' },
      }),
    ).toBe(false);
    expect(
      isJavaScriptAnalysisRequest({
        ...request,
        files: {
          ...request.files,
          'src/evil.js\nthrow new Error("injected")//.js': 'export const evil = true;',
        },
      }),
    ).toBe(false);
    expect(
      isJavaScriptAnalysisRequest({
        ...request,
        files: { ...request.files, 'src/evil\u2028injected.js': 'export const evil = true;' },
      }),
    ).toBe(false);
    expect(
      isJavaScriptAnalysisRequest({
        ...request,
        files: { ...request.files, 'src/evil\ud800.js': 'export const evil = true;' },
      }),
    ).toBe(false);
    expect(isJavaScriptAnalysisRequest({ ...request, sourceType: 'script' })).toBe(false);
  });

  it('Worker requestは固定Profileを受理し、未知Profileと未知fieldを拒否する', () => {
    const request = { ...input, requestId: 'request-1' };

    expect(isJavaScriptAnalysisRequest(request)).toBe(true);
    expect(isJavaScriptAnalysisRequest({ ...request, capabilityProfile: 'custom' })).toBe(false);
    expect(isJavaScriptAnalysisRequest({ ...request, extra: true })).toBe(false);
  });

  it('Worker responseはSource fact unionをexact keyで検証する', () => {
    const request = { ...input, requestId: 'request-1' };
    const result = success(request);
    const binding = {
      kind: 'binding',
      name: 'score',
      declarationKind: 'const',
      scopeDepth: 0,
      file: 'script.js',
      line: 1,
      column: 1,
    } as const;

    expect(
      isAnalyzerWorkerResponse({ type: 'result', result: { ...result, facts: [binding] } }),
    ).toBe(true);
    for (const fact of [
      { kind: 'literal', valueType: 'string' },
      { kind: 'binary-expression', operator: '===' },
      { kind: 'assignment', name: 'score', operator: '+=' },
      { kind: 'branch', branchKind: 'if', hasAlternate: true },
      { kind: 'return' },
    ] as const) {
      expect(
        isAnalyzerWorkerResponse({
          type: 'result',
          result: {
            ...result,
            facts: [{ ...fact, file: 'script.js', line: 1, column: 1 }],
          },
        }),
      ).toBe(true);
    }
    expect(
      isAnalyzerWorkerResponse({
        type: 'result',
        result: { ...result, facts: [{ ...binding, unexpected: true }] },
      }),
    ).toBe(false);
    expect(
      isAnalyzerWorkerResponse({
        type: 'result',
        result: { ...result, facts: [{ ...binding, kind: 'custom' }] },
      }),
    ).toBe(false);
  });

  it('Worker responseは閉じたmodule graphだけを受理する', () => {
    const request = {
      exerciseSessionId: 'javascript:exercise-1',
      executionRevision: 4,
      entryFile: 'src/main.js',
      files: {
        'src/main.js': "import { score } from './score.js'; console.log(score);",
        'src/score.js': 'export const score = 1;',
      },
      sourceType: 'module',
      capabilityProfile: 'modules',
      guardIdentifier: '__tsumuBudget',
      requestId: 'request-workspace',
    } as const satisfies JavaScriptWorkspaceAnalysisRequest;
    const result = workspaceSuccess(request);

    expect(isAnalyzerWorkerResponse({ type: 'result', result })).toBe(true);
    expect(
      isAnalyzerWorkerResponse({
        type: 'result',
        result: {
          ...result,
          modules: [
            result.modules[0],
            {
              ...result.modules[1],
              dependencies: [
                {
                  specifier: './missing.js',
                  resolvedFile: 'src/missing.js',
                  start: 22,
                  end: 36,
                },
              ],
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isAnalyzerWorkerResponse({
        type: 'result',
        result: { ...result, modules: [result.modules[0], result.modules[0]] },
      }),
    ).toBe(false);

    const otherModule = {
      file: 'src/other.js',
      instrumentedCode: 'export const score = 2;',
      dependencies: [],
    } as const;
    expect(
      isAnalyzerWorkerResponse({
        type: 'result',
        result: {
          ...result,
          modules: [
            result.modules[0],
            otherModule,
            {
              ...result.modules[1],
              dependencies: [
                {
                  ...result.modules[1]!.dependencies[0]!,
                  resolvedFile: 'src/other.js',
                },
              ],
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('親側でも不正なWorkspace契約をWorkerへ送らずsecurity failureへ閉じる', async () => {
    const worker = new FakeWorker();
    const client = new JavaScriptAnalyzerClient({
      workerFactory: () => worker,
      requestIdFactory: () => 'request-invalid-workspace',
    });

    const result = await client.analyze({
      ...workspaceInput,
      sourceType: 'script',
    } as never);

    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [{ kind: 'security', severity: 'error' }],
    });
    await client.dispose();
  });

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

  it('Workspace responseをentryFile identityで受理する', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const client = new JavaScriptAnalyzerClient({
      workerFactory: () => worker,
      requestIdFactory: () => 'request-workspace',
      deadlineMs: 500,
    });
    const pending = client.analyze(workspaceInput);
    const message = worker.postMessage.mock.calls[0]?.[0] as {
      type: 'analyze';
      request: JavaScriptAnalysisRequest;
    };
    if (!('files' in message.request)) throw new Error('Workspace requestではありません');

    worker.emit({ type: 'result', result: workspaceSuccess(message.request) });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toMatchObject({
      status: 'success',
      entryFile: 'src/main.js',
    });
    await client.dispose();
    vi.useRealTimers();
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
