import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { cleanupCookieAcceptance, withCookieDeadline } from './next-form-cookie-lifecycle.mjs';

/** 回帰自体が停止しないよう、対象の期限より長い独立した失敗期限を置く。 */
async function testDeadline(operation) {
  const controller = new globalThis.AbortController();
  try {
    return await Promise.race([
      operation,
      delay(500, undefined, { signal: controller.signal }).then(() => {
        throw new Error('test watchdog: operation did not settle');
      }),
    ]);
  } finally {
    controller.abort();
  }
}

test('応答完了の未解決Promiseを期限超過として失敗させる', async () => {
  await assert.rejects(
    testDeadline(withCookieDeadline(() => new Promise(() => {}), 30, 'response-finished')),
    /Cookie acceptance deadline: response-finished/u,
  );
});

test('停止失敗でもBrowserとbridgeを回収し、元の失敗を結果へ残す', async () => {
  const calls = [];
  const failures = await cleanupCookieAcceptance({
    stop: async () => {
      calls.push('stop');
      throw new Error('stop failed');
    },
    context: {
      close: async () => {
        calls.push('context');
      },
    },
    browser: {
      close: async () => {
        calls.push('browser');
      },
    },
    bridges: [
      {
        server: {
          close: (done) => {
            calls.push('bridge');
            done();
          },
        },
        sockets: new Set(),
      },
    ],
  });
  assert.deepEqual(calls, ['stop', 'context', 'browser', 'bridge']);
  assert.deepEqual(
    failures.map(({ stage }) => stage),
    ['cleanup-stop'],
  );
});

test('Context終了が停止しても後続のBrowser終了を試行する', async () => {
  let closed = false;
  const failures = await testDeadline(
    cleanupCookieAcceptance({
      context: { close: () => new Promise(() => {}) },
      browser: {
        close: async () => {
          closed = true;
        },
      },
      closeTimeoutMs: 30,
    }),
  );
  assert.equal(closed, true);
  assert.deepEqual(
    failures.map(({ stage }) => stage),
    ['cleanup-context'],
  );
});

test('upgrade済みの自分の接続を破棄してbridgeを終了する', async () => {
  const server = createServer();
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (_request, socket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: cookie-test\r\n\r\n',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = connect(server.address().port, '127.0.0.1');
  const closed = once(client, 'close');
  try {
    await once(client, 'connect');
    client.write(
      'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: cookie-test\r\n\r\n',
    );
    await once(client, 'data');
    const failures = await testDeadline(
      cleanupCookieAcceptance({ bridges: [{ server, sockets }], closeTimeoutMs: 100 }),
    );
    assert.deepEqual(failures, []);
    await testDeadline(closed);
    assert.equal(server.listening, false);
    assert.equal(sockets.size, 0);
  } finally {
    client.destroy();
    for (const socket of sockets) socket.destroy();
    server.close();
  }
});
