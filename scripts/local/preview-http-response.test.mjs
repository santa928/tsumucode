import { Buffer } from 'node:buffer';
import { test, vi } from 'vitest';
import console from 'node:console';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { forwardPreviewResponse } from './preview-http-response.mjs';
import { lessonThemeResponseHeaders } from './next-form-cookie.mjs';

test('明示したAction診断は実HTTPの長さと終端だけを記録し、本文とCookieを残さない', async () => {
  vi.stubEnv('TSUMUCODE_COOKIE_DIAGNOSTICS', '1');
  const records = [];
  const logger = vi
    .spyOn(console, 'log')
    .mockImplementation((line) => records.push(JSON.parse(line)));
  try {
    await fixture(
      true,
      async (port) => {
        const response = await globalThis.fetch(`http://127.0.0.1:${port}`, { method: 'POST' });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-length'), '12');
        const ordinal = response.headers.get('x-tsumucode-cookie-observation');
        assert.match(ordinal, /^[1-9]\d*$/u);
        assert.ok(records.some((record) => String(record.postOrdinal) === ordinal));
        assert.equal(await response.text(), 'private-body');
      },
      (req, res) =>
        res
          .writeHead(200, {
            'content-type': 'text/x-component',
            'set-cookie': 'private-cookie=secret',
          })
          .end('private-body'),
      32,
      undefined,
      true,
    );
    assert.ok(
      records.some(
        (record) =>
          record.stage === 'upstream-end' && record.upstreamComplete && record.bytes === 12,
      ),
    );
    assert.ok(records.some((record) => record.stage === 'headers' && record.contentLength === 12));
    assert.ok(
      records.some((record) => record.stage === 'downstream-finish' && record.writableFinished),
    );
    const serialized = JSON.stringify(records);
    for (const forbidden of ['private-body', 'private-cookie', 'secret', '127.0.0.1'])
      assert.equal(serialized.includes(forbidden), false);
    vi.stubEnv('TSUMUCODE_COOKIE_DIAGNOSTICS', '0');
    await fixture(
      true,
      async (port) => {
        const response = await globalThis.fetch(`http://127.0.0.1:${port}`, { method: 'POST' });
        assert.equal(response.headers.get('x-tsumucode-cookie-observation'), null);
        assert.equal(await response.text(), 'private-body');
      },
      (req, res) => res.writeHead(200, { 'content-type': 'text/x-component' }).end('private-body'),
      32,
      undefined,
      true,
    );
  } finally {
    logger.mockRestore();
    vi.unstubAllEnvs();
  }
});

/** 実HTTPの2listenerで、転送の到着順・上限・固定ヘッダーを検査する。 */
async function fixture(
  stream,
  operation,
  respond,
  limit = 32,
  complete,
  bufferStream = false,
  beforeHeaders,
) {
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
          beforeHeaders: beforeHeaders ? () => beforeHeaders(reply) : undefined,
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

test('実HTTP応答は送信直前の許可ヘッダーだけを追加する', async () => {
  await fixture(
    false,
    async (port) => {
      const response = await globalThis.fetch(`http://127.0.0.1:${port}`);
      assert.equal(response.headers.get('set-cookie'), 'lesson-theme=dark; HttpOnly');
      assert.equal(await response.text(), 'ready');
    },
    (req, res) => res.writeHead(200, { 'set-cookie': 'management=unsafe' }).end('ready'),
    32,
    undefined,
    false,
    async () => ({ 'set-cookie': 'lesson-theme=dark; HttpOnly' }),
  );
});

test('逐次・全量・Action bufferとも送信前に実行失効／採点開始／control不通を拒否する', async () => {
  const target = {
    workspaceId: 'next-ch04-l01-e01',
    profile: 'next-project-v1',
    runId: '01234567-89ab-4cde-8123-0123456789ab',
    sourceRevision: 1,
    sourceHash: 'a'.repeat(64),
    dev: 1,
    ino: 2,
  };
  const req = {
    method: 'POST',
    url: `/w/${target.workspaceId}/${target.runId}/api/note`,
    headers: {
      host: `${target.runId}.localhost:4175`,
      origin: `http://${target.runId}.localhost:4175`,
    },
  };
  for (const [stream, bufferStream] of [
    [false, false],
    [true, false],
    [true, true],
  ]) {
    for (const changed of [{ ...target, sourceRevision: 2 }, { ...target, grading: true }, null]) {
      let completed = 0;
      let current = target;
      let checking;
      let release;
      const started = new Promise((resolve) => {
        checking = resolve;
      });
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      await fixture(
        stream,
        async (port) => {
          let received = false;
          const pending = globalThis.fetch(`http://127.0.0.1:${port}`).then((response) => {
            received = true;
            return response;
          });
          await started;
          assert.equal(received, false, 'control照合待ち中はheadersを発行しない');
          current = changed;
          release();
          const response = await pending;
          assert.equal(response.status, 502);
          assert.equal(response.headers.get('set-cookie'), null);
          assert.equal(await response.text(), '');
        },
        (request, res) =>
          res
            .writeHead(200, {
              'content-type': 'text/html',
              'set-cookie': 'lesson-theme=dark; Path=/',
            })
            .end('ready'),
        32,
        () => completed++,
        bufferStream,
        (upstream) =>
          lessonThemeResponseHeaders(req, target, upstream, async () => {
            checking();
            await gate;
            if (!current) throw new Error('Control unavailable');
            return current;
          }),
      );
      assert.equal(completed, 0);
    }
  }
});

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
  test(`Action bufferの${name}は内容を一部も送らず、完了記録を作らない`, async () => {
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
