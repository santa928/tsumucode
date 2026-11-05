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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.each([false, true])(
  '#196: 別clientの回収待ち中にstopしたclientは回収reject=%s後も再開しない',
  async (rejectCleanup) => {
    const current = await snapshot();
    const digest = Uint8Array.from(current.identity.sourceHash.match(/../gu) ?? [], (byte) =>
      Number.parseInt(byte, 16),
    ).buffer;
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async () => digest) } });
    vi.useFakeTimers();
    const delivered = deferred();
    const cleanupBlocked = deferred();
    const releaseCleanup = deferred();
    const fetchMock = vi.fn(async (path: string) => {
      if (path.endsWith('/session')) return Response.json({ apiVersion: 1, token: 'a'.repeat(64) });
      if (path.endsWith('/practice/runs')) return Response.json(current);
      if (path.endsWith('/cancel')) {
        cleanupBlocked.resolve();
        await releaseCleanup.promise;
        if (rejectCleanup) throw new Error('回収失敗');
      }
      return Response.json({
        ...current,
        phase: 'ended',
        reason: 'cancelled',
        removed: true,
        purged: path.endsWith('/ack'),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const previous = new LocalPythonPracticeClient();
    const running = previous.start(request, delivered.resolve).catch((error: unknown) => error);
    await delivered.promise;
    const stopping = previous.stop().catch((error: unknown) => error);
    await cleanupBlocked.promise;
    const waiting = new LocalPythonPracticeClient();
    const received = vi.fn();
    const waitingRun = waiting.start(request, received).catch((error: unknown) => error);
    try {
      await vi.advanceTimersByTimeAsync(0);
      await waiting.stop();
    } finally {
      releaseCleanup.resolve();
      await stopping;
      await vi.advanceTimersByTimeAsync(150);
      await running;
      await waitingRun;
    }
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith('/session'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith('/practice/runs'))).toHaveLength(
      1,
    );
    expect(received).not.toHaveBeenCalled();

    if (rejectCleanup) {
      // 完了した失敗を共有し続けず、次clientは実controllerの排他エラーを受け取る。
      fetchMock.mockImplementation(async (path: string) =>
        path.endsWith('/session')
          ? Response.json({ apiVersion: 1, token: 'b'.repeat(64) })
          : Response.json({ error: '回収未確認のため作成を拒否します。' }, { status: 409 }),
      );
      const nextReceived = vi.fn();
      await expect(new LocalPythonPracticeClient().start(request, nextReceived)).rejects.toThrow(
        '回収未確認のため作成を拒否します。',
      );
      expect(fetchMock.mock.calls.filter(([path]) => path.endsWith('/session'))).toHaveLength(2);
      expect(fetchMock.mock.calls.filter(([path]) => path.endsWith('/practice/runs'))).toHaveLength(
        2,
      );
      expect(nextReceived).not.toHaveBeenCalled();
    }
  },
);

it.each(['cancel', 'ack'] as const)(
  '#196: 旧clientの%s待ち中は別clientが新しいrunを作成しない',
  async (blockedPhase) => {
    const current = await snapshot();
    const digest = Uint8Array.from(current.identity.sourceHash.match(/../gu) ?? [], (byte) =>
      Number.parseInt(byte, 16),
    ).buffer;
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async () => digest) } });
    vi.useFakeTimers();
    const delivered = deferred();
    const cleanupBlocked = deferred();
    const releaseCleanup = deferred();
    const terminal = { ...current, phase: 'ended', reason: 'cancelled', removed: true };
    const nextRequest = { ...request, exerciseSessionId: 'next-session', executionRevision: 4 };
    const next = {
      ...terminal,
      identity: {
        ...current.identity,
        runId: 'c8e59e32-a90b-4db0-b0dc-08e3913baef9',
        sessionId: nextRequest.exerciseSessionId,
        executionRevision: nextRequest.executionRevision,
      },
    };
    let oldPurged = false;
    let creations = 0;
    const fetchMock = vi.fn(async (path: string) => {
      if (path.endsWith('/session')) return Response.json({ apiVersion: 1, token: 'a'.repeat(64) });
      if (path.endsWith('/practice/runs')) {
        creations += 1;
        if (creations === 1) return Response.json(current);
        return oldPurged
          ? Response.json(next)
          : Response.json({ error: '旧runの回収がまだ完了していません。' }, { status: 409 });
      }
      if (path.includes(current.identity.runId)) {
        if (path.endsWith('/' + blockedPhase)) {
          cleanupBlocked.resolve();
          await releaseCleanup.promise;
        }
        if (path.endsWith('/ack')) oldPurged = true;
        return Response.json({ ...terminal, purged: path.endsWith('/ack') });
      }
      return Response.json({ ...next, purged: path.endsWith('/ack') });
    });
    vi.stubGlobal('fetch', fetchMock);
    const previousClient = new LocalPythonPracticeClient();
    const previousRunning = previousClient.start(request, () => {
      delivered.resolve();
    });
    await delivered.promise;
    const stopping = previousClient.stop();
    await cleanupBlocked.promise;
    const received = vi.fn();
    const nextRunning = new LocalPythonPracticeClient().start(nextRequest, received).then(
      () => undefined,
      (error: unknown) => error,
    );
    let result: unknown;
    try {
      // digestとfetchは即時解決するmock。未解決なのは明示した旧回収gateだけ。
      await vi.advanceTimersByTimeAsync(0);
      expect(creations).toBe(1);
      expect(received).not.toHaveBeenCalled();
    } finally {
      releaseCleanup.resolve();
      await stopping;
      await vi.advanceTimersByTimeAsync(150);
      await previousRunning;
      result = await nextRunning;
    }
    expect(result).toBeUndefined();
    expect(creations).toBe(2);
    expect(received).toHaveBeenCalledWith(next);
  },
);

it.each(['hash', 'session'] as const)(
  '#196: %s準備中のstop後に旧startが次のAPIへ再開しない',
  async (blockedPhase) => {
    const current = await snapshot();
    const digest = Uint8Array.from(current.identity.sourceHash.match(/../gu) ?? [], (byte) =>
      Number.parseInt(byte, 16),
    ).buffer;
    const preparationBlocked = deferred();
    const releasePreparation = deferred();
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async () => {
          if (blockedPhase === 'hash') {
            preparationBlocked.resolve();
            await releasePreparation.promise;
          }
          return digest;
        }),
      },
    });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        calls.push(path);
        if (path.endsWith('/session')) {
          if (blockedPhase === 'session') {
            preparationBlocked.resolve();
            await releasePreparation.promise;
          }
          return Response.json({ apiVersion: 1, token: 'a'.repeat(64) });
        }
        return Response.json({
          ...current,
          phase: 'ended',
          reason: 'cancelled',
          removed: true,
          purged: path.endsWith('/ack'),
        });
      }),
    );
    const client = new LocalPythonPracticeClient();
    const received = vi.fn();
    const running = client.start(request, received);
    await preparationBlocked.promise;
    const stopping = client.stop();
    releasePreparation.resolve();
    await stopping;
    await running;
    expect(calls.filter((path) => path.endsWith('/session'))).toHaveLength(
      blockedPhase === 'hash' ? 0 : 1,
    );
    expect(calls.some((path) => path.endsWith('/practice/runs'))).toBe(false);
    expect(received).not.toHaveBeenCalled();
  },
);
