import { afterEach, expect, it, vi } from 'vitest';
import {
  LocalPythonPracticeClient,
  type PythonPracticeSnapshot,
} from './LocalPythonPracticeClient';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const request = {
  exerciseId: 'python-basics-ch01-l02-e01',
  contentRevision: 'python-r1',
  exerciseSessionId: 'practice-session',
  executionRevision: 3,
  files: { 'main.py': 'print(input())\n' },
};

async function snapshot(): Promise<PythonPracticeSnapshot> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(request.files['main.py']),
  );
  return {
    purpose: 'practice',
    identity: {
      runId: 'd67b5131-e5df-4f8c-bad0-c6bfbfbda372',
      sessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      sourceHash: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join(''),
    },
    phase: 'waiting-input',
    reason: null,
    inputRequestSequence: 1,
    inputCount: 0,
    inputBytes: 0,
    activeMs: 100,
    waitingMs: 0,
    elapsedMs: 100,
    stdout: '',
    stderr: '',
    removed: false,
    recoveryNeeded: false,
    purged: false,
    exitCode: null,
  };
}

it('作成途中の中止は遅い作成応答と回収を待ち、旧要求を画面へ届けない', async () => {
  const current = await snapshot();
  let resolveCreated!: (response: Response) => void;
  let resolveCancelled!: (response: Response) => void;
  const created = new Promise<Response>((resolve) => {
    resolveCreated = resolve;
  });
  const cancelled = new Promise<Response>((resolve) => {
    resolveCancelled = resolve;
  });
  const fetchMock = vi.fn(async (path: string) => {
    if (path.endsWith('/session')) return Response.json({ apiVersion: 1, token: 'a'.repeat(64) });
    if (path.endsWith('/practice/runs')) return created;
    if (path.endsWith('/cancel')) return cancelled;
    return Response.json({
      ...current,
      phase: 'ended',
      reason: 'cancelled',
      removed: true,
      purged: true,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new LocalPythonPracticeClient();
  const received = vi.fn();
  let finished = false;
  const running = client.start(request, received).then(() => {
    finished = true;
  });
  await vi.waitFor(() => {
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/practice/runs'))).toBe(true);
  });
  const stopping = client.stop();
  resolveCreated(Response.json(current));
  await vi.waitFor(() => {
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/cancel'))).toBe(true);
  });
  expect(finished).toBe(false);
  expect(received).not.toHaveBeenCalled();
  resolveCancelled(
    Response.json({ ...current, phase: 'ended', reason: 'cancelled', removed: true, purged: true }),
  );
  await stopping;
  await running;
  expect(finished).toBe(true);
  await expect(client.send(1, '遅れた入力')).rejects.toThrow();
});

it('Source hashの不一致は入力を許可せず、通知前に同じrunを回収する', async () => {
  const current = await snapshot();
  current.identity.sourceHash = '0'.repeat(64);
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      calls.push(path);
      if (path.endsWith('/session')) return Response.json({ apiVersion: 1, token: 'a'.repeat(64) });
      return Response.json(
        path.endsWith('/practice/runs')
          ? current
          : { ...current, phase: 'ended', reason: 'cancelled', removed: true, purged: true },
      );
    }),
  );
  const received = vi.fn();
  await expect(new LocalPythonPracticeClient().start(request, received)).rejects.toThrow();
  expect(received).not.toHaveBeenCalled();
  expect(calls.some((path) => path.endsWith('/cancel'))).toBe(true);
  expect(calls.some((path) => path.endsWith('/ack'))).toBe(true);
});

it('送信失敗を自動で再送せず、回収未確認を正常停止へ変換しない', async () => {
  const current = await snapshot();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (path.endsWith('/session')) return Response.json({ apiVersion: 1, token: 'a'.repeat(64) });
      if (path.endsWith('/input')) throw new Error('connection lost');
      if (path.endsWith('/cancel'))
        return Response.json({
          ...current,
          phase: 'ended',
          reason: 'cancelled',
          recoveryNeeded: true,
          purged: true,
        });
      return Response.json(current);
    }),
  );
  const client = new LocalPythonPracticeClient();
  const received = vi.fn();
  const running = client.start(request, received).catch((error: unknown) => error);
  await vi.waitFor(() => {
    expect(received).toHaveBeenCalled();
  });
  await expect(client.send(1, '保存しない入力')).rejects.toThrow('connection lost');
  await expect(client.stop()).rejects.toThrow('回収');
  expect(await running).toBeInstanceOf(Error);
});

it('起動前の回収済み失敗をelapsedMs 0で受け取り、同じidentityをackする', async () => {
  const current = {
    ...(await snapshot()),
    phase: 'ended' as const,
    reason: 'system-error',
    inputRequestSequence: null,
    activeMs: 0,
    elapsedMs: 0,
    removed: true,
  };
  const fetchMock = vi.fn(async (path: string) => {
    if (path.endsWith('/session')) return Response.json({ apiVersion: 1, token: 'a'.repeat(64) });
    return Response.json({ ...current, purged: path.endsWith('/ack') });
  });
  vi.stubGlobal('fetch', fetchMock);
  const received = vi.fn();
  await new LocalPythonPracticeClient().start(request, received);
  expect(received).toHaveBeenCalledWith(current);
  expect(fetchMock.mock.calls.map(([path]) => path)).toContain(
    `/api/practice/runs/${current.identity.runId}/ack`,
  );
  expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/cancel'))).toBe(false);
});
