import { PYTHON_LESSONS } from '../../../core/runtime/pythonLessonProfiles.mjs';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalPythonExecutionService } from './LocalPythonExecutionService';
import type { ExecutionRequest } from '../../../core/runtime/contracts';
import { LocalConsoleExecutionService } from './LocalConsoleExecutionService';

it('固定採点は練習/Previewの入力を読まずgrades APIだけへSourceを送る', async () => {
  const inputReader = vi.fn(() => ['保存しない実値']);
  const gradeRequest = { ...request, options: { purpose: 'grade' } };
  const fetchMock = vi.fn(async (path: string, options: RequestInit) => {
    if (path.endsWith('/session')) return Response.json({ apiVersion: 1, token: 'a'.repeat(64) });
    if (path.endsWith('/python-capabilities'))
      return Response.json({
        apiVersion: 1,
        exerciseIds: Object.keys(PYTHON_LESSONS),
        contentRevision: 'python-r1',
        runtimeProfileId: 'cpython-values-v1',
        engineVersion: '3.14.2',
      });
    if (path.endsWith('/grades')) {
      expect(JSON.parse(options.body as string)).not.toHaveProperty('inputLines');
      return Response.json({ state: 'running' });
    }
    return Response.json({
      state: 'completed',
      result: {
        ...gradeRequest,
        engineVersion: '3.14.2',
        exitCode: 0,
        status: 'succeeded',
        diagnostics: [],
        evidence: [],
        console: [],
      },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const result = await new LocalConsoleExecutionService(
    'python-basics-ch01-l01-e01',
    'python-r1',
    'cpython',
    inputReader,
  ).execute(gradeRequest);
  expect(result.status).toBe('succeeded');
  expect(inputReader).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls.map(([path]) => path)).toContain('/api/grades');
  expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain('/api/runs');
});

afterEach(() => vi.unstubAllGlobals());

const request: ExecutionRequest = {
  runId: 'python-run',
  exerciseSessionId: 'python-session',
  executionRevision: 1,
  backend: 'local',
  engine: 'cpython',
  languageId: 'python',
  requiredCapabilities: ['console'],
  files: { 'main.py': 'count = 3\nprint(count)\nprint(count + 2)\n' },
  options: {},
};

/** HTTP正常でも別engine・版・古い編集結果を合格入力へ渡さない。 */
it.each(['valid', 'wrong-engine', 'wrong-version', 'stale-revision', 'invalid-exit'])(
  'Python結果照合: %s',
  async (mode) => {
    const fetchMock = vi.fn(async (path: string) => {
      const packet = path.endsWith('/session')
        ? { apiVersion: 1, token: 'a'.repeat(64) }
        : path.endsWith('/python-capabilities')
          ? {
              apiVersion: 1,
              exerciseIds: Object.keys(PYTHON_LESSONS),
              contentRevision: 'python-r1',
              runtimeProfileId: 'cpython-values-v1',
              engineVersion: '3.14.2',
            }
          : path.endsWith('/runs')
            ? {}
            : {
                state: 'completed',
                result: {
                  ...request,
                  engine: mode === 'wrong-engine' ? 'node' : 'cpython',
                  engineVersion: mode === 'wrong-version' ? '3.12' : '3.14.2',
                  executionRevision: mode === 'stale-revision' ? 0 : 1,
                  status: 'succeeded',
                  exitCode: mode === 'invalid-exit' ? 256 : 0,
                  diagnostics: [],
                  evidence: [],
                  console: [],
                },
              };
      return new Response(JSON.stringify(packet));
    });
    vi.stubGlobal('fetch', fetchMock);
    const value = await new LocalPythonExecutionService(
      'python-basics-ch01-l01-e01',
      'python-r1',
    ).execute(request);
    expect(value.status).toBe(mode === 'valid' ? 'succeeded' : 'system-error');
    if (mode === 'valid') expect(value.exitCode).toBe(0);
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/capabilities'))).toBe(false);
  },
);
