import assert from 'node:assert/strict';
import console from 'node:console';
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { installNextActionBodyDrain } from './next-form-drain.mjs';
import { watchNextFormReceipts } from './next-form-receipts.mjs';

// 実HTTPの部分切断・signal中断を成功にせず、元Responseとfetch入力を保持する。
const origin = 'http://127.0.0.1:4175';
const base = '/w/next-ch04-l02-e01/01234567-89ab-4cde-8123-0123456789ab/';
const seen = [];
let sequence = 0;
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const mode = Buffer.concat(chunks).toString();
  seen.push({ method: req.method, path: req.url, body: mode, probe: req.headers['x-probe'] });
  if (req.method !== 'POST' || req.url !== base) {
    res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>対象外</h1>');
    return;
  }
  const request = ++sequence;
  res.writeHead(mode === 'wrong-status' ? 503 : 200, {
    'content-type': mode === 'wrong-type' ? 'text/html' : 'text/x-component',
    'x-tsumucode-form-response': mode === 'wrong-sequence' ? '9' : String(request),
    ...(mode === 'no-length'
      ? {}
      : { 'content-length': mode === 'oversize' ? '524289' : mode === 'normal' ? '524288' : '8' }),
  });
  res.write('test');
  await delay(250);
  if (mode === 'short' || mode === 'oversize') res.destroy();
  else if (!res.destroyed) res.end(mode === 'normal' ? Buffer.alloc(512 * 1024 - 4, 't') : 'more');
});
await new Promise((resolve) => server.listen(4175, '127.0.0.1', resolve));
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.addInitScript(installNextActionBodyDrain, { origin, base });
  const emitted = [];
  const receipts = await watchNextFormReceipts(page, origin, base, (receipt) =>
    emitted.push(receipt),
  );
  await page.goto(origin + base);
  const outcomes = [];
  for (const mode of [
    'normal',
    'short',
    'signal-abort',
    'wrong-sequence',
    'no-length',
    'oversize',
    'wrong-type',
    'wrong-status',
  ]) {
    const outcome = await page.evaluate(async (mode) => {
      const cancellation = new globalThis.AbortController();
      const request = new globalThis.Request(globalThis.location.href, {
        method: 'POST',
        headers: { 'x-probe': 'preserved' },
        body: mode,
        signal: cancellation.signal,
      });
      const timer =
        mode === 'signal-abort' ? globalThis.setTimeout(() => cancellation.abort(), 75) : undefined;
      try {
        const response = await globalThis.fetch(request, { method: 'post' });
        const metadata = {
          url: response.url,
          type: response.type,
          status: response.status,
          redirected: response.redirected,
          bodyUsed: response.bodyUsed,
        };
        // Nextが本文の読み取りを先に終えても、既に正常EOFを受け取っている。
        const reader = response.body.getReader();
        await reader.read();
        await reader.cancel();
        return { mode, rejected: false, metadata };
      } catch {
        return { mode, rejected: true };
      } finally {
        globalThis.clearTimeout(timer);
      }
    }, mode);
    assert.equal(outcome.rejected, mode !== 'normal', mode);
    outcomes.push(outcome);
    for (let attempt = 0; attempt < 20 && emitted.length < sequence; attempt++) await delay(25);
  }
  assert.deepEqual(outcomes[0].metadata, {
    url: origin + base,
    type: 'basic',
    status: 200,
    redirected: false,
    bodyUsed: false,
  });
  const observed = receipts();
  assert.equal(observed[0].receivedBytes, 512 * 1024);
  assert.equal(observed[0].state, 'finished');
  assert.equal(observed[1].receivedBytes, 4);
  assert.equal(observed[1].state, 'failed');
  assert.equal(observed[2].state, 'aborted');
  assert.equal(seen.filter((request) => request.method === 'POST').length, 8);
  assert.ok(
    seen
      .filter((request) => request.method === 'POST')
      .every((request) => request.probe === 'preserved'),
  );
  assert.deepEqual(
    seen.filter((request) => request.method === 'POST').map((request) => request.body),
    outcomes.map((outcome) => outcome.mode),
  );
  const outside = await page.evaluate(async () => {
    const get = await globalThis.fetch(globalThis.location.href);
    const query = await globalThis.fetch(globalThis.location.href + '?outside=1', {
      method: 'POST',
      body: 'outside',
    });
    return [await get.text(), await query.text()];
  });
  assert.deepEqual(outside, ['<h1>対象外</h1>', '<h1>対象外</h1>']);
  console.log(
    JSON.stringify({
      browser: browser.version(),
      outcomes,
      receipts: observed,
      outside: 'unchanged',
      retries: 0,
    }),
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
