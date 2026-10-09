// @vitest-environment node
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { lstat } from 'node:fs/promises';
import { request } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { docker } from './docker-engine.mjs';
import { applyProject, ProjectApplyError } from './project-engine.mjs';
import { NEXT_PROFILE } from './next-project-protocol.mjs';

vi.mock('./docker-engine.mjs', () => ({ docker: vi.fn(), containerConfig: vi.fn() }));
vi.mock('node:fs/promises', () => ({ lstat: vi.fn() }));
vi.mock('node:http', () => ({ request: vi.fn() }));
vi.mock('node:timers', () => ({
  setTimeout: (...args) => globalThis.setTimeout(...args),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
}));
vi.mock('node:timers/promises', () => ({
  setTimeout: (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
}));

const record = {
  profile: NEXT_PROFILE,
  workspaceId: 'next-ch01-l01-e01',
  sourceRevision: 2,
  sourceHash: 'a'.repeat(64),
  files: { 'app/page.tsx': 'private-source' },
};
const previous = { ...record, runId: '11111111-1111-4111-8111-111111111111', sourceRevision: 1 };
const transport = { applied: previous, socket: { dev: 1, ino: 2 } };
let metadata;
let readyAt;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.resetAllMocks();
  readyAt = 17000;
  lstat.mockImplementation(async (path) =>
    path.endsWith('http.sock')
      ? { isSocket: () => true, uid: 1000, gid: 1000, dev: 1, ino: 2 }
      : { isDirectory: () => true, uid: 0, gid: 1000, mode: 0o750 & ~0o222 },
  );
  docker.mockImplementation(async (_method, path, body, timeout) => {
    const duration = path.endsWith('/exec') ? 3000 : path.endsWith('/start') ? 4000 : 1000;
    expect(duration).toBeLessThanOrEqual(timeout);
    await new Promise((resolve) => globalThis.setTimeout(resolve, duration));
    if (path.endsWith('/exec')) {
      metadata = JSON.parse(Buffer.from(body.Cmd.slice(2).join(''), 'base64').toString()).metadata;
      return { Id: 'fixed-exec' };
    }
    return { Running: false, ExitCode: 0 };
  });
  request.mockImplementation((options, callback) => {
    const req = new EventEmitter();
    req.destroy = (error) => {
      req.emit('error', error);
      req.emit('close');
    };
    req.end = () => {
      globalThis.setTimeout(() => {
        const res = new EventEmitter();
        res.statusCode = options.path.endsWith('pause') || Date.now() >= readyAt ? 200 : 503;
        callback(res);
        res.emit(
          'data',
          Buffer.from(
            JSON.stringify(
              options.path.endsWith('pause')
                ? {
                    profile: previous.profile,
                    workspaceId: previous.workspaceId,
                    runId: previous.runId,
                    sourceRevision: previous.sourceRevision,
                    sourceHash: previous.sourceHash,
                  }
                : metadata,
            ),
          ),
        );
        res.emit('end');
        req.emit('close');
      }, 10);
    };
    return req;
  });
});
afterEach(() => vi.useRealTimers());

it('Nativeの15秒準備を含む反映を入口から20秒以内で確認する', async () => {
  const applied = applyProject(
    'fixed-container',
    record,
    '11111111-1111-4111-8111-111111111111',
    transport,
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(18000);
  expect(await applied).toBeUndefined();
  expect(Date.now()).toBeLessThan(20000);
});

it('前段階で使った時間を足し直さず、20秒でready失敗を判別する', async () => {
  readyAt = 23000;
  const result = applyProject(
    'fixed-container',
    record,
    '11111111-1111-4111-8111-111111111111',
    transport,
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(20000);
  const error = await result;
  expect(error).toBeInstanceOf(ProjectApplyError);
  expect({ phase: error.phase, reason: error.reason }).toEqual({
    phase: 'ready',
    reason: 'deadline',
  });
  expect(Date.now()).toBe(20000);
});

it('Dockerの例外本文やSourceを診断へ含めず、固定段階と理由だけを返す', async () => {
  docker.mockRejectedValue(
    Object.assign(new Error('private-source secret-token'), { code: 'ECONNRESET' }),
  );
  const result = applyProject(
    'fixed-container',
    record,
    '11111111-1111-4111-8111-111111111111',
    transport,
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(10);
  const error = await result;
  expect({ phase: error.phase, reason: error.reason }).toEqual({
    phase: 'exec-create',
    reason: 'socket',
  });
  expect(JSON.stringify(error)).not.toMatch(/private-source|secret-token/u);
  expect(error.message).toBe('Project apply failed');
});

it('sealed socketの不一致では反映execを実行しない', async () => {
  await expect(
    applyProject('fixed-container', record, '11111111-1111-4111-8111-111111111111', {
      ...transport,
      socket: { dev: 1, ino: 3 },
    }),
  ).rejects.toMatchObject({ phase: 'pause', reason: 'identity' });
  expect(docker).not.toHaveBeenCalled();
});
