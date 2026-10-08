import { test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { compileNextDataBackends } from './next-data-backend-build.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { nextDataBackend } from './next-data-backend.mjs';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal();
  const mocked = { ...original, readFile: vi.fn() };
  return { ...mocked, default: mocked };
});
vi.mocked(readFile).mockResolvedValue(JSON.stringify(compileNextDataBackends()));

const base = '/w/lesson/run';
async function serverFor(backend, accepted = () => {}) {
  const server = createServer((req, res) => {
    accepted(req);
    if (!backend.handle(req, res)) res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    request: (path, options) =>
      globalThis.fetch(`http://127.0.0.1:${server.address().port}${base}${path}`, options),
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

test('固定APIの実取得履歴を記録し、新保存版と未知queryを分ける', async () => {
  const backend = await nextDataBackend('next-ch03-l01-e01', base);
  const server = await serverFor(backend);
  const renewed = await serverFor(await nextDataBackend('next-ch03-l01-e01', base));
  try {
    assert.equal((await (await server.request('/api/sample?mode=fresh')).json()).readId, 1);
    assert.equal((await (await server.request('/api/sample?mode=fresh')).json()).readId, 2);
    const state = await (await server.request('/api/sample?control=inspect')).json();
    assert.equal(state.counts.fresh, 2);
    assert.equal(state.history.fresh.length, 2);
    assert.equal((await (await renewed.request('/api/sample?mode=fresh')).json()).readId, 1);
    for (const path of [
      '/api/sample?mode=fresh&extra=1',
      '/api/sample?mode=%66resh',
      '/api/weather?state=clear',
    ])
      assert.equal((await server.request(path)).status, 404);
    assert.equal((await server.request('/api/sample?mode=fresh', { method: 'POST' })).status, 404);
    backend.retire();
    assert.equal((await server.request('/api/sample?mode=fresh')).status, 503);
  } finally {
    await Promise.all([server.close(), renewed.close()]);
  }
});

test('天気の初回失敗をresetし、旧保存版の遅延応答を破棄する', async () => {
  const backend = await nextDataBackend('next-ch03-l02-e01', base);
  let acceptSlow;
  const accepted = new Promise((resolve) => {
    acceptSlow = resolve;
  });
  const server = await serverFor(backend, (req) => {
    if (req.url.endsWith('?state=slow')) acceptSlow();
  });
  try {
    assert.equal((await server.request('/api/weather?state=flaky')).status, 503);
    assert.equal((await server.request('/api/weather?state=flaky')).status, 200);
    assert.equal((await (await server.request('/api/weather?control=reset')).json()).reset, true);
    assert.equal((await server.request('/api/weather?state=flaky')).status, 503);
    assert.equal((await server.request('/api/weather?state=missing')).status, 404);
    const pending = server.request('/api/weather?state=slow');
    const denied = assert.rejects(pending);
    await accepted;
    backend.retire();
    await denied;
  } finally {
    await server.close();
  }
});
