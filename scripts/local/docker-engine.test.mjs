// @vitest-environment node
import { EventEmitter } from 'node:events';
import { request } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { followOutput } from './docker-engine.mjs';
import { LIMITS } from './protocol.mjs';

vi.mock('node:http', () => ({ request: vi.fn() }));
vi.mock('node:timers', () => ({
  setTimeout: (...args) => globalThis.setTimeout(...args),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
}));
afterEach(() => vi.useRealTimers());

/** Docker logsが終端を返さない場合も待機を有限にするHTTP境界の回帰。実Engine試験ではない。 */
it('出力streamが終了しなくても期限内に失敗して解放する', async () => {
  vi.useFakeTimers();
  const response = new EventEmitter();
  response.statusCode = 200;
  response.destroy = vi.fn();
  const req = new EventEmitter();
  req.end = () => {};
  req.destroy = vi.fn();
  request.mockImplementation((_options, callback) => {
    callback(response);
    return req;
  });
  const output = followOutput(
    'test-container',
    () => {},
    () => {},
  );
  let state = 'pending';
  const finished = output.done.then(
    () => {
      state = 'resolved';
    },
    () => {
      state = 'rejected';
    },
  );
  await vi.advanceTimersByTimeAsync(LIMITS.wallMs + 10000);
  expect(state).toBe('rejected');
  expect(response.destroy).toHaveBeenCalled();
  expect(req.destroy).toHaveBeenCalled();
  await finished;
});
