import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import {
  cleanupCookieAcceptance,
  cookieNetworkErrorClass,
  finishCookieActionResponse,
  finishCookieResponse,
  withCookieDeadline,
} from './next-form-cookie-lifecycle.mjs';

test('Request失敗は固定分類だけを残し、任意の例外本文を保存しない', () => {
  for (const error of [
    'net::ERR_ABORTED',
    'net::ERR_INSUFFICIENT_RESOURCES',
    'net::ERR_NETWORK_CHANGED',
  ])
    assert.equal(cookieNetworkErrorClass(error), error);
  for (const error of [
    undefined,
    null,
    'https://private.invalid/?token=private',
    'unexpected input',
  ])
    assert.equal(cookieNetworkErrorClass(error), 'other');
});

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

/** 実Browserで確認した「失敗通知後もfinishedは未解決」をイベント境界で再現する。 */
function responseHarness(errorText = '非公開の通信詳細') {
  const context = new EventEmitter();
  let failed = false;
  const request = { failure: () => (failed ? { errorText } : null) };
  const completion = Promise.withResolvers();
  return {
    context,
    response: { request: () => request, finished: () => completion.promise },
    fail: (target = request) => {
      if (target === request) failed = true;
      context.emit('requestfailed', target);
    },
    finish: () => completion.resolve(null),
  };
}

test('選択Requestの失敗を応答期限まで待たず固定分類で伝える', async () => {
  const fixture = responseHarness();
  const pending = finishCookieResponse(fixture.context, fixture.response, 100);
  fixture.fail();
  await assert.rejects(testDeadline(pending), {
    name: 'CookieAcceptanceRequestError',
    message: 'Cookie acceptance request failed',
  });
  assert.equal(fixture.context.listenerCount('requestfailed'), 0);
});

test('Response選択前に失敗済みの同一Requestも失敗として伝える', async () => {
  const fixture = responseHarness();
  fixture.fail();
  await assert.rejects(testDeadline(finishCookieResponse(fixture.context, fixture.response, 100)), {
    name: 'CookieAcceptanceRequestError',
  });
  assert.equal(fixture.context.listenerCount('requestfailed'), 0);
});

test('別Requestの失敗では落とさず選択応答の正常完了を待つ', async () => {
  const fixture = responseHarness();
  const pending = finishCookieResponse(fixture.context, fixture.response, 100);
  fixture.fail({ failure: () => ({ errorText: '別通信' }) });
  fixture.finish();
  assert.equal(await testDeadline(pending), null);
  assert.equal(fixture.context.listenerCount('requestfailed'), 0);
});

test('応答未完了は期限超過にし終端監視も回収する', async () => {
  const fixture = responseHarness();
  await assert.rejects(testDeadline(finishCookieResponse(fixture.context, fixture.response, 30)), {
    name: 'CookieAcceptanceDeadlineError',
  });
  assert.equal(fixture.context.listenerCount('requestfailed'), 0);
});

test('作者Actionは正常通信でも実consumerのEOF確認を必須にする', async () => {
  const fixture = responseHarness();
  let verified = 0;
  fixture.finish();
  const result = await testDeadline(
    finishCookieActionResponse(
      fixture.context,
      fixture.response,
      async () => {
        verified++;
        return true;
      },
      100,
    ),
  );
  assert.deepEqual(result, { completed: true, browserTerminal: 'finished', consumerEof: true });
  assert.equal(verified, 1);
});

test('同じRequestのERR_ABORTEDは実consumer EOFが確認できた場合だけ分類として残す', async () => {
  const fixture = responseHarness('net::ERR_ABORTED');
  fixture.fail();
  const result = await testDeadline(
    finishCookieActionResponse(fixture.context, fixture.response, async () => true, 100),
  );
  assert.deepEqual(result, {
    completed: true,
    browserTerminal: 'net::ERR_ABORTED',
    consumerEof: true,
  });
  assert.equal(fixture.context.listenerCount('requestfailed'), 0);
});

test('ERR_ABORTEDがあってもconsumer未完了・対応不明なら合格にしない', async () => {
  const fixture = responseHarness('net::ERR_ABORTED');
  fixture.fail();
  await assert.rejects(
    testDeadline(
      finishCookieActionResponse(fixture.context, fixture.response, async () => false, 100),
    ),
    { name: 'CookieAcceptanceConsumerError' },
  );
});

test('ERR_ABORTED以外の通信失敗はconsumer検査で上書きしない', async () => {
  const fixture = responseHarness('net::ERR_CONNECTION_RESET');
  let verified = false;
  fixture.fail();
  await assert.rejects(
    testDeadline(
      finishCookieActionResponse(
        fixture.context,
        fixture.response,
        async () => {
          verified = true;
          return true;
        },
        100,
      ),
    ),
    { name: 'CookieAcceptanceRequestError' },
  );
  assert.equal(verified, false);
});

test('consumer検査の例外は元の失敗として伝える', async () => {
  const fixture = responseHarness();
  fixture.finish();
  await assert.rejects(
    testDeadline(
      finishCookieActionResponse(
        fixture.context,
        fixture.response,
        async () => {
          throw new Error('consumer verification failed');
        },
        100,
      ),
    ),
    /consumer verification failed/u,
  );
});

test('consumer EOFの待機にも同じ全体期限を適用する', async () => {
  const fixture = responseHarness();
  fixture.finish();
  await assert.rejects(
    testDeadline(
      finishCookieActionResponse(
        fixture.context,
        fixture.response,
        () => new Promise(() => {}),
        30,
      ),
    ),
    { name: 'CookieAcceptanceDeadlineError' },
  );
});

test('通信終端自体が不明ならconsumer検査だけで正常完了へ変更しない', async () => {
  const fixture = responseHarness();
  let verified = false;
  await assert.rejects(
    testDeadline(
      finishCookieActionResponse(
        fixture.context,
        fixture.response,
        async () => {
          verified = true;
          return true;
        },
        30,
      ),
    ),
    { name: 'CookieAcceptanceDeadlineError' },
  );
  assert.equal(verified, false);
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
