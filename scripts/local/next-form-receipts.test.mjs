import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'vitest';
import { watchNextFormReceipts } from './next-form-receipts.mjs';

const origin = 'http://01234567-89ab-4cde-8123-0123456789ab.localhost:4175';
const base = '/w/next-ch04-l02-e01/01234567-89ab-4cde-8123-0123456789ab/';
const headers = {
  'X-Tsumucode-Form-Response': '1',
  'Content-Length': '4',
  'Private-Token': 'private-value',
};

async function observe() {
  const network = new EventEmitter();
  network.send = async (method) => assert.equal(method, 'Network.enable');
  const emitted = [];
  const receipts = await watchNextFormReceipts(
    { context: () => ({ newCDPSession: async () => network }) },
    origin,
    base,
    (receipt) => emitted.push(receipt),
  );
  network.emit('Network.requestWillBeSent', {
    requestId: 'one',
    request: { method: 'POST', url: origin + base, postData: 'private-input' },
  });
  return { network, receipts, emitted };
}

for (const early of [true, false]) {
  test(`raw headerが通常応答の${early ? '前' : '後'}でもbyte・終端を失わない`, async () => {
    const { network, receipts } = await observe();
    const extra = () =>
      network.emit('Network.responseReceivedExtraInfo', {
        requestId: 'one',
        statusCode: 200,
        headers,
      });
    if (early) extra();
    network.emit('Network.responseReceived', {
      requestId: 'one',
      response: { status: 200, url: origin + base, headers: {} },
    });
    network.emit('Network.dataReceived', { requestId: 'one', dataLength: 4 });
    network.emit('Network.loadingFailed', { requestId: 'one', canceled: true });
    if (!early) extra();
    assert.deepEqual(receipts(), [
      {
        request: 1,
        bridgeRequest: 1,
        status: 200,
        expectedBytes: 4,
        receivedBytes: 4,
        state: 'aborted',
        encoding: 'plain',
      },
    ]);
    assert.equal(JSON.stringify(receipts()).includes('private'), false);
  });
}

test('header未取得の切断もunknownとして残し、部分受信と区別する', async () => {
  const { network, receipts, emitted } = await observe();
  network.emit('Network.dataReceived', { requestId: 'one', dataLength: 2 });
  network.emit('Network.loadingFailed', { requestId: 'one', canceled: false });
  assert.deepEqual(receipts(), [
    {
      request: 1,
      bridgeRequest: 'unknown',
      status: 'unknown',
      expectedBytes: 'unknown',
      receivedBytes: 2,
      state: 'failed',
      encoding: 'unknown',
    },
  ]);
  assert.deepEqual(emitted, receipts());
  network.emit('Network.loadingFinished', { requestId: 'one' });
  assert.equal(emitted.length, 1);
  assert.equal(receipts()[0].state, 'failed');
});

test('不正header・受信上限・対象外要求から任意文字列や無制限記録を作らない', async () => {
  const { network, receipts } = await observe();
  network.emit('Network.responseReceivedExtraInfo', {
    requestId: 'one',
    statusCode: 999,
    headers: { 'content-length': '524289', 'x-tsumucode-form-response': 'private-token' },
  });
  for (const dataLength of [-1, 0.5, 999999, 999999])
    network.emit('Network.dataReceived', { requestId: 'one', dataLength });
  for (const [method, url] of [
    ['GET', origin + base],
    ['POST', origin + base + '?private=1'],
    ['POST', 'http://other.localhost:4175' + base],
  ])
    network.emit('Network.requestWillBeSent', { requestId: url, request: { method, url } });
  assert.equal(receipts().length, 1);
  assert.equal(receipts()[0].receivedBytes, 512 * 1024 + 1);
  assert.equal(receipts()[0].expectedBytes, 'unknown');
  assert.equal(receipts()[0].bridgeRequest, 'unknown');
  assert.equal(receipts()[0].status, 'unknown');
  for (let index = 2; index <= 12; index++)
    network.emit('Network.requestWillBeSent', {
      requestId: String(index),
      request: { method: 'POST', url: origin + base },
    });
  assert.equal(receipts().length, 8);
  assert.equal(JSON.stringify(receipts()).includes('private'), false);
});
