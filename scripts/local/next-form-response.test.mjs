import assert from 'node:assert/strict';
import { test, vi, afterEach } from 'vitest';
import { createNextFormResponses } from './next-form-response.mjs';

const origin = 'http://01234567-89ab-4cde-8123-0123456789ab.localhost:4175';
const path = '/w/next-ch04-l02-e01/01234567-89ab-4cde-8123-0123456789ab';
const response = (request, overrides = {}) => ({
  headers: () => ({ 'x-tsumucode-form-response': String(request) }),
  url: () => origin + path,
  request: () => ({ method: () => 'POST' }),
  status: () => 200,
  ...overrides,
});

afterEach(() => vi.useRealTimers());

test('同じURLへの旧POST完了を次のPOSTへ再利用しない', async () => {
  vi.useFakeTimers();
  const tracker = createNextFormResponses(origin);
  const first = tracker.begin('POST', path);
  first.status = 200;
  first.complete = true;
  const second = tracker.begin('POST', path);
  second.status = 200;
  assert.equal(await tracker.completed(response(1), 1), true);
  assert.equal(await tracker.completed(response(1), 2), false);
  const pending = tracker.completed(response(2), 2);
  await vi.advanceTimersByTimeAsync(500);
  assert.equal(await pending, false);
  second.complete = true;
  assert.equal(await tracker.completed(response(2), 2), true);
});

for (const [name, overrides] of [
  ['連番なし', { headers: () => ({}) }],
  ['範囲外の連番', { headers: () => ({ 'x-tsumucode-form-response': '9' }) }],
  ['別origin', { url: () => 'http://other.localhost:4175' + path }],
  ['別path', { url: () => origin + path + '/other' }],
  ['未知query', { url: () => origin + path + '?other=1' }],
  ['別method', { request: () => ({ method: () => 'GET' }) }],
  ['別status', { status: () => 503 }],
]) {
  test(`${name}の実Responseを成功記録へ結び付けない`, async () => {
    const tracker = createNextFormResponses(origin);
    const record = tracker.begin('POST', path);
    record.status = 200;
    record.complete = true;
    assert.equal(await tracker.completed(response(1, overrides), 1), false);
  });
}

test('切断・転送失敗を後からの完了で補わず、Browser完了通知に依存しない', async () => {
  const tracker = createNextFormResponses(origin);
  const record = tracker.begin('POST', path);
  record.status = 200;
  record.complete = true;
  const observed = response(1, {
    finished: () => {
      throw new Error('完了通知は使わない');
    },
  });
  assert.equal(await tracker.completed(observed, 1), true);
  record.failed = true;
  assert.equal(await tracker.completed(observed, 1), false);
});

test('GETを記録せず、POST記録は固定8件までに限定する', () => {
  const tracker = createNextFormResponses(origin);
  assert.equal(tracker.begin('GET', path), undefined);
  for (let request = 1; request <= 8; request++)
    assert.equal(tracker.begin('POST', path).request, request);
  assert.equal(tracker.begin('POST', path), undefined);
});
