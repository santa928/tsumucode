import { Buffer } from 'node:buffer';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { forwardPreviewResponse } from './preview-http-response.mjs';

/** 実HTTPの2listenerで、転送の到着順・上限・固定ヘッダーを検査する。 */
async function fixture(stream, operation, respond, limit = 32, complete, bufferStream = false) {
  const source = createServer(respond);
  await new Promise((resolve) => source.listen(0, '127.0.0.1', resolve));
  const proxy = createServer((req, res) => {
    const upstream = request(
      { host: '127.0.0.1', port: source.address().port, method: req.method },
      (reply) =>
        forwardPreviewResponse(reply, res, {
          method: req.method,
          headers: { 'content-security-policy': "default-src 'none'" },
          stream,
          bufferStream,
          limit,
          complete,
          fail: () => (res.headersSent ? res.destroy() : res.writeHead(502).end()),
        }),
    );
    res.once('close', () => upstream.destroy());
    upstream.on('error', () => res.destroy());
    upstream.end();
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  try {
    await operation(proxy.address().port);
  } finally {
    source.closeAllConnections();
    proxy.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => source.close(resolve)),
      new Promise((resolve) => proxy.close(resolve)),
    ]);
  }
}

test('逐次応答は上流完了前に届き、Cookie/CSPを上流から採用しない', async () => {
  let completed = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await fixture(
    true,
    async (port) => {
      const response = await new Promise((resolve) =>
        request({ host: '127.0.0.1', port }, resolve).end(),
      );
      assert.equal(response.headers['set-cookie'], undefined);
      assert.equal(response.headers['content-security-policy'], "default-src 'none'");
      const [first] = await once(response, 'data');
      assert.equal(first.toString(), 'loading');
      assert.equal(completed, 0);
      const chunks = [first];
      response.on('data', (chunk) => chunks.push(chunk));
      const ended = once(response, 'end');
      release();
      await ended;
      assert.equal(Buffer.concat(chunks).toString(), 'loadingready');
    },
    async (req, res) => {
      res.writeHead(200, {
        'content-type': 'text/html',
        'set-cookie': 'learner=private',
        'content-security-policy': 'unsafe',
      });
      res.write('loading');
      await gate;
      res.end('ready');
    },
    32,
    () => completed++,
  );
  assert.equal(completed, 1);
});

test('逐次応答のbyte上限超過は、届いた途中結果を成功として完了させない', async () => {
  let completed = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await fixture(
    true,
    async (port) => {
      const response = await new Promise((resolve, reject) =>
        request({ host: '127.0.0.1', port }, resolve).on('error', reject).end(),
      );
      response.resume();
      const ended = once(response, 'end');
      release();
      await assert.rejects(ended);
      assert.equal(response.complete, false);
    },
    async (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write('loading');
      await gate;
      res.end('x'.repeat(40));
    },
    32,
    () => completed++,
  );
  assert.equal(completed, 0);
});

test('全量検査は従来どおり、上限超過の内容を一部も送らない', async () => {
  await fixture(
    false,
    async (port) => {
      const response = await new Promise((resolve) =>
        request({ host: '127.0.0.1', port }, resolve).end(),
      );
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      await once(response, 'end');
      assert.equal(response.statusCode, 502);
      assert.equal(Buffer.concat(chunks).length, 0);
    },
    (req, res) => res.end('x'.repeat(40)),
  );
});

test('Weatherの逐次応答でredirectや実行形式を通さない', async () => {
  for (const [status, type] of [
    [302, 'text/html'],
    [200, 'application/javascript'],
  ]) {
    await fixture(
      true,
      async (port) => {
        const response = await new Promise((resolve) =>
          request({ host: '127.0.0.1', port }, resolve).end(),
        );
        response.resume();
        await once(response, 'end');
        assert.equal(response.statusCode, 502);
      },
      (req, res) =>
        res.writeHead(status, { 'content-type': type, location: '/api/session' }).end('private'),
    );
  }
});

test('採点用RSCは正常EOF後に固定長で送り、途中のheadersや本文を公開しない', async () => {
  let completed = 0;
  let release;
  let written;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    written = resolve;
  });
  await fixture(
    true,
    async (port) => {
      let received = false;
      const response = new Promise((resolve, reject) =>
        request({ host: '127.0.0.1', port }, (reply) => {
          received = true;
          resolve(reply);
        })
          .on('error', reject)
          .end(),
      );
      await started;
      assert.equal(received, false);
      assert.equal(completed, 0);
      release();
      const reply = await response;
      assert.equal(reply.headers['content-length'], '12');
      assert.equal(reply.headers['transfer-encoding'], undefined);
      assert.equal(reply.headers['set-cookie'], undefined);
      const chunks = [];
      reply.on('data', (chunk) => chunks.push(chunk));
      await once(reply, 'end');
      assert.equal(Buffer.concat(chunks).toString(), 'loadingready');
    },
    async (req, res) => {
      res.writeHead(200, { 'content-type': 'text/x-component', 'set-cookie': 'private=1' });
      res.write('loading');
      written();
      await gate;
      res.end('ready');
    },
    32,
    () => completed++,
    true,
  );
  assert.equal(completed, 1);
});

for (const [name, respond] of [
  [
    'byte上限超過',
    (req, res) => res.writeHead(200, { 'content-type': 'text/x-component' }).end('x'.repeat(40)),
  ],
  [
    '途中切断',
    (req, res) => {
      res.writeHead(200, { 'content-type': 'text/x-component' });
      res.write('partial', () => res.destroy());
    },
  ],
  [
    '不許可の応答型',
    (req, res) => res.writeHead(200, { 'content-type': 'application/javascript' }).end('private'),
  ],
  [
    'redirect',
    (req, res) =>
      res.writeHead(302, { 'content-type': 'text/html', location: '/private' }).end('private'),
  ],
]) {
  test(`採点用bufferの${name}は内容を一部も送らず、完了記録を作らない`, async () => {
    let completed = 0;
    await fixture(
      true,
      async (port) => {
        const reply = await new Promise((resolve, reject) =>
          request({ host: '127.0.0.1', port }, resolve).on('error', reject).end(),
        );
        const chunks = [];
        reply.on('data', (chunk) => chunks.push(chunk));
        await once(reply, 'end');
        assert.equal(reply.statusCode, 502);
        assert.equal(Buffer.concat(chunks).length, 0);
      },
      respond,
      32,
      () => completed++,
      true,
    );
    assert.equal(completed, 0);
  });
}
