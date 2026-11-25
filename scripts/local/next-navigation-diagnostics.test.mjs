// @vitest-environment node
import console from 'node:console';
import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import { observeNavigation } from './next-navigation-diagnostics.mjs';

afterEach(() => vi.restoreAllMocks());

const origin = 'http://127.0.0.1:4175';
const routes = new Map([['/workspace-id/', 'home']]);

test('失敗時の記録を同一frame・同一originの対象Documentと固定ラベルに限定する', async () => {
  const page = new EventEmitter();
  const frame = { url: () => origin + '/workspace-id/?private#fragment' };
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failed = new Error('unprintable body');
  const request = (url, owner = frame, navigation = true) => ({
    url: () => url,
    isNavigationRequest: () => navigation,
    frame: () => owner,
  });
  await expect(
    observeNavigation(page, frame, routes, async (mark) => {
      mark('select', 'home');
      page.emit('request', request('https://other.example/workspace-id/'));
      page.emit('request', request('http://user:private@127.0.0.1:4175/workspace-id/'));
      page.emit('request', request(origin + '/unknown'));
      page.emit('request', request(frame.url(), {}, true));
      page.emit('request', request(frame.url(), frame, false));
      page.emit('response', { request: () => request(frame.url()), status: () => 200 });
      page.emit('framenavigated', frame);
      throw failed;
    }),
  ).rejects.toBe(failed);
  expect(log).toHaveBeenCalledTimes(1);
  const ms = expect.any(Number);
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({
    navigation: [
      { ms, stage: 'select', route: 'home' },
      { ms, stage: 'response', route: 'home', status: 200 },
      { ms, stage: 'committed', route: 'home' },
      { ms, stage: 'check-failed' },
    ],
  });
  expect(page.eventNames()).toEqual([]);
});

test('成功した操作の記録を出力せず、監視を解除する', async () => {
  const page = new EventEmitter();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await observeNavigation(page, {}, routes, async (mark) => mark('selected', 'home'));
  expect(log).not.toHaveBeenCalled();
  expect(page.eventNames()).toEqual([]);
});
