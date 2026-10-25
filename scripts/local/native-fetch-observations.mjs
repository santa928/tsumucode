// 作者診断専用。Next・フォーム・Cookieを使わずBrowserの読了と通信終端を分ける。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { clearTimeout, setTimeout } from 'node:timers';
import { chromium } from '@playwright/test';

const body = 'x'.repeat(179);
const sent = new Map();
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html' }).end('<p>native reader</p>');
    return;
  }
  const match = /^\/(no-store|no-cache)\/(reader|array-buffer)\/([0-7])$/u.exec(request.url);
  if (!match || request.method !== 'POST') {
    response.writeHead(404).end();
    return;
  }
  const record = { bytes: body.length, finish: false };
  sent.set(request.url, record);
  response.once('finish', () => {
    record.finish = true;
  });
  request.resume();
  response
    .writeHead(200, {
      'content-type': 'text/x-component',
      'content-length': String(body.length),
      'cache-control': match[1],
    })
    .end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const rows = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin, { timeout: 5000 });
  for (const [cache, consumer] of [
    ['no-store', 'reader'],
    ['no-cache', 'reader'],
    ['no-store', 'array-buffer'],
  ]) {
    for (let iteration = 0; iteration < 8; iteration++) {
      const path = `/${cache}/${consumer}/${iteration}`;
      const url = origin + path;
      let timer;
      let selected;
      const terminal = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ terminal: 'deadline' }), 2000);
      });
      const result = Promise.withResolvers();
      const onRequest = (request) => {
        if (request.url() === url) selected = request;
      };
      const onFinished = (request) => {
        if (request === selected) result.resolve({ terminal: 'finished', errorClass: null });
      };
      const onFailed = (request) => {
        if (request !== selected) return;
        const error = request.failure()?.errorText;
        result.resolve({
          terminal: 'failed',
          errorClass: error === 'net::ERR_ABORTED' ? error : 'other',
        });
      };
      context.on('request', onRequest);
      context.on('requestfinished', onFinished);
      context.on('requestfailed', onFailed);
      try {
        const read = await page.evaluate(
          async ({ url, consumer }) => {
            const response = await globalThis.fetch(url, { method: 'POST', body: 'fixed' });
            if (consumer === 'array-buffer') {
              const bytes = await response.arrayBuffer();
              return { status: response.status, bytes: bytes.byteLength, readDone: true };
            }
            const reader = response.body.getReader();
            let bytes = 0;
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) return { status: response.status, bytes, readDone: true };
              bytes += chunk.value.byteLength;
            }
          },
          { url, consumer },
        );
        const network = await Promise.race([terminal, result.promise]);
        assert.equal(read.status, 200);
        assert.equal(read.bytes, body.length);
        assert.equal(read.readDone, true);
        rows.push({ cache, consumer, iteration, ...read, ...network, server: sent.get(path) });
      } finally {
        clearTimeout(timer);
        context.off('request', onRequest);
        context.off('requestfinished', onFinished);
        context.off('requestfailed', onFailed);
      }
    }
  }
  const result = {
    purpose: 'Native fetch isolation; no Next, form, input, history or Cookie operations',
    browserVersion: browser.version(),
    architecture: process.arch,
    cdp: false,
    faultInjection: false,
    forcedGc: false,
    rows,
  };
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  // 診断保存の失敗で元のBrowser例外を覆わず、固定の資源記録だけ標準出力へ残す。
  console.log(
    JSON.stringify({
      event: 'native-fetch-resources',
      peak: (
        await readFile('/sys/fs/cgroup/memory.peak', 'utf8').catch(() => 'unavailable')
      ).trim(),
      events: (
        await readFile('/sys/fs/cgroup/memory.events', 'utf8').catch(() => 'unavailable')
      ).trim(),
    }),
  );
}
