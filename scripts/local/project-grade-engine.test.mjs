import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const engine = vi.hoisted(() => ({ docker: vi.fn(), removeContainer: vi.fn() }));
vi.mock('./docker-engine.mjs', () => ({
  ...engine,
  containerConfig: () => ({ HostConfig: {} }),
}));
vi.mock('node:timers', async (importOriginal) => {
  const original = await importOriginal();
  const timers = {
    ...original,
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer) => globalThis.clearTimeout(timer),
  };
  return { ...timers, default: timers };
});
import { gradeProject } from './project-grade-engine.mjs';

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

test('全体10秒で固定graderを回収し、基盤503として期限超過を返す', async () => {
  vi.useFakeTimers();
  engine.removeContainer.mockResolvedValue(undefined);
  engine.docker.mockImplementation(async (method, path) => {
    if (path.startsWith('/images/')) return { Id: 'fixed-image' };
    if (path.startsWith('/containers/create')) return { Id: 'grader' };
    if (path.endsWith('/wait')) return new Promise(() => {});
  });
  const grading = gradeProject({
    owner: 'tsumucode-learning-test',
    image: 'tsumucode-learning-test-grader:local',
    source: { workspaceId: 'one', sourceRevision: 1, sourceHash: 'fixed-source' },
    runId: '00000000-0000-4000-8000-000000000001',
    socket: { dev: 1, ino: 2 },
  });
  const rejected = assert.rejects(grading, {
    status: 503,
    message: '採点の全体期限10秒を超えました。実行を開始し直して判定してください。',
  });
  await vi.advanceTimersByTimeAsync(9999);
  assert.equal(engine.removeContainer.mock.calls.length, 0);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  assert.ok(engine.removeContainer.mock.calls.some(([id]) => id === 'grader'));
});
