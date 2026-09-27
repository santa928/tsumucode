import { afterEach, expect, it, vi } from 'vitest';
import type { ExecutionRequest } from '../../../core/runtime/contracts';
import { LocalNodeExecutionService } from './LocalNodeExecutionService';

afterEach(() => vi.unstubAllGlobals());

/** HTTPが成功しても回収失敗の結果を停止成功へ変換しない。実Docker試験とは別の契約回帰。 */
it('cancel結果のsystem-errorを停止成功として返さない', async () => {
  const request: ExecutionRequest = {
    runId: 'run-1',
    exerciseSessionId: 'session-1',
    executionRevision: 1,
    backend: 'local',
    engine: 'node',
    languageId: 'javascript',
    requiredCapabilities: ['console'],
    options: {},
    files: { 'script.js': 'while (true) {}', 'index.html': '', 'styles.css': '' },
  };
  let polled: (() => void) | undefined;
  const polling = new Promise<void>((resolve) => {
    polled = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      let value: unknown = {};
      if (input.endsWith('/session')) value = { apiVersion: 1, token: 'a'.repeat(64) };
      else if (input.endsWith('/capabilities'))
        value = {
          apiVersion: 1,
          exerciseIds: ['javascript-ch03-l05-e01'],
          contentRevision: 'rev',
          runtimeProfileId: 'node-closure-v1',
        };
      else if (input.endsWith('/cancel'))
        value = {
          state: 'completed',
          result: {
            ...request,
            status: 'system-error',
            engineVersion: 'v24.18.0',
            diagnostics: [],
            evidence: [],
            console: [],
          },
        };
      else if (input.includes('/runs/')) {
        value = { state: 'running' };
        polled?.();
      }
      return new Response(JSON.stringify(value), { status: 200 });
    }),
  );
  const service = new LocalNodeExecutionService('javascript-ch03-l05-e01', 'rev');
  const running = service.execute(request);
  await polling;
  await expect(service.stop()).rejects.toThrow(/停止/);
  await running;
});

/** 能力応答の対象一覧で実行可否を決め、旧controllerへ新しい演習を送らない。 */
it.each([
  [
    'javascript-ch03-l05-e01',
    ['javascript-ch03-l05-e01', 'javascript-ch03-l05-e02', 'javascript-ch03-l05-e03'],
    'succeeded',
  ],
  [
    'javascript-ch03-l05-e02',
    ['javascript-ch03-l05-e01', 'javascript-ch03-l05-e02', 'javascript-ch03-l05-e03'],
    'succeeded',
  ],
  [
    'javascript-ch03-l05-e03',
    ['javascript-ch03-l05-e01', 'javascript-ch03-l05-e02', 'javascript-ch03-l05-e03'],
    'succeeded',
  ],
  ['javascript-ch03-l05-e02', undefined, 'unsupported'],
  [
    'javascript-ch03-l05-e04',
    ['javascript-ch03-l05-e01', 'javascript-ch03-l05-e02', 'javascript-ch03-l05-e03'],
    'unsupported',
  ],
] as const)('capability一覧との照合ケース%#', async (exerciseId, exerciseIds, status) => {
  const request: ExecutionRequest = {
    runId: 'run-1',
    exerciseSessionId: 'session-1',
    executionRevision: 1,
    backend: 'local',
    engine: 'node',
    languageId: 'javascript',
    requiredCapabilities: ['console'],
    options: {},
    files: { 'script.js': 'console.log(10)', 'index.html': '', 'styles.css': '' },
  };
  const fetchMock = vi.fn(async (input: string) => {
    const value = input.endsWith('/session')
      ? { apiVersion: 1, token: 'a'.repeat(64) }
      : input.endsWith('/capabilities')
        ? {
            apiVersion: 1,
            exerciseId: 'javascript-ch03-l05-e01',
            exerciseIds,
            contentRevision: 'rev',
            runtimeProfileId: 'node-closure-v1',
          }
        : input.endsWith('/runs')
          ? {}
          : {
              state: 'completed',
              result: {
                ...request,
                status: 'succeeded',
                engineVersion: 'v24.18.0',
                diagnostics: [],
                evidence: [],
                console: [],
              },
            };
    return new Response(JSON.stringify(value), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const result = await new LocalNodeExecutionService(exerciseId, 'rev').execute(request);
  expect(result.status).toBe(status);
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/runs'))).toBe(status === 'succeeded');
  if (status === 'unsupported') expect(result.diagnostics[0]?.learnerMessage).toContain('再起動');
});
