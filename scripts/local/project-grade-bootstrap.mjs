import { nextPreviewRequest } from './next-data-preview.mjs';
import { forwardPreviewResponse } from './preview-http-response.mjs';
import { observeNextData } from './next-data-observations.mjs';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { lstat } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { chromium } from '@playwright/test';
import { nextWorkspace } from './next-project-protocol.mjs';
import { NextLessonObservationError, observeNextLesson } from './next-project-observations.mjs';
import {
  previewBase,
  previewOrigin,
  previewRoute,
  previewHeaders,
  previewResponseLimit,
  previewWebSocketProtocol,
} from './preview-contract.mjs';

// 固定imageのtrusted checkerだけが実DOMを読む。learnerのpostMessage/Consoleを採点結果にしない。
const { metadata, socket } = JSON.parse(Buffer.from(process.argv[2], 'base64').toString('utf8'));
const origin = previewOrigin(metadata.runId);
const base = previewBase(metadata.workspaceId, metadata.runId);
const parent = await lstat('/transport');
const endpoint = await lstat('/transport/http.sock');
assert.equal(parent.uid, 0);
assert.equal(parent.gid, 1000);
assert.equal(parent.mode & 0o777, 0o550);
assert.ok(endpoint.isSocket());
assert.equal(endpoint.uid, 1000);
assert.equal(endpoint.gid, 1000);
assert.equal(endpoint.dev, socket.dev);
assert.equal(endpoint.ino, socket.ino);

/** 認証情報を持たない固定HTTP bridge。実Viteの応答だけをboundedに渡す。 */
function readHttp(path) {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath: '/transport/http.sock', path, headers: { host: new URL(origin).host } },
      (res) => {
        const chunks = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > previewResponseLimit(path, metadata))
            res.destroy(new Error('Grade response limit'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            type: res.headers['content-type'],
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.setTimeout(3000, () => req.destroy(new Error('Grade HTTP deadline')));
    req.on('error', reject);
    req.end();
  });
}

async function marker() {
  const reply = await readHttp('/__tsumucode_ready');
  assert.equal(reply.status, 200);
  const observed = JSON.parse(reply.body.toString());
  for (const [key, value] of Object.entries(metadata)) assert.equal(observed[key], value);
}

let requests = 0;
// 同じtrusted bridgeが全量送信したRSCだけを、部分応答と区別する。
const completedResponses = new Map();
async function completedResponse(response) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (
      completedResponses.get(new URL(response.url()).pathname + new URL(response.url()).search) ===
      true
    )
      return true;
    await delay(25);
  }
  return false;
}
const bridge = createServer((req, res) => {
  if (
    requests >= 8 ||
    req.method !== 'GET' ||
    req.headers.host !== new URL(origin).host ||
    !previewRoute(req.url, metadata) ||
    !nextPreviewRequest(req, metadata) ||
    req.url.split('?')[0] === `${base}api/echo`
  ) {
    res.writeHead(403).end();
    return;
  }
  if (req.headers.rsc === '1') {
    if (completedResponses.has(req.url) || completedResponses.size >= 16) {
      res.writeHead(403).end();
      return;
    }
    completedResponses.set(req.url, false);
  }
  requests++;
  const policy = nextPreviewRequest(req, metadata);
  let timer;
  const fail = () => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) res.destroy();
    else res.writeHead(503).end();
  };
  const upstream = request(
    {
      socketPath: '/transport/http.sock',
      path: req.url,
      method: req.method,
      headers: { host: new URL(origin).host, ...policy.headers },
    },
    (reply) =>
      forwardPreviewResponse(reply, res, {
        method: req.method,
        headers: previewHeaders(metadata.runId, metadata.profile),
        limit: previewResponseLimit(req.url, metadata),
        stream: policy.stream,
        fail,
        complete: () => {
          if (req.headers.rsc === '1') completedResponses.set(req.url, true);
        },
      }),
  );
  res.once('close', () => {
    clearTimeout(timer);
    requests--;
    upstream.destroy();
  });
  timer = setTimeout(() => upstream.destroy(new Error('Grade HTTP deadline')), 10000);
  upstream.on('error', fail);
  upstream.end();
});
// Vite自身のHMR clientが正常に起動するための固定WS。採点中の2枠/2 MiBだけを許可する。
const websockets = new Set();
bridge.on('upgrade', (req, client, head) => {
  let upstream;
  let proxy;
  let timer;
  const close = () => {
    clearTimeout(timer);
    client.destroy();
    upstream?.destroy();
    proxy?.destroy();
    websockets.delete(close);
  };
  client.on('error', close);
  client.once('close', close);
  if (
    websockets.size >= 2 ||
    req.method !== 'GET' ||
    req.headers.host !== new URL(origin).host ||
    req.headers.origin !== origin ||
    req.headers['sec-websocket-protocol'] !== previewWebSocketProtocol(metadata.profile) ||
    !previewRoute(req.url, metadata, true)
  ) {
    close();
    return;
  }
  websockets.add(close);
  proxy = request({
    socketPath: '/transport/http.sock',
    method: 'GET',
    path: req.url,
    headers: {
      host: new URL(origin).host,
      origin,
      connection: 'Upgrade',
      upgrade: 'websocket',
      'sec-websocket-key': req.headers['sec-websocket-key'],
      'sec-websocket-version': '13',
      ...(previewWebSocketProtocol(metadata.profile)
        ? { 'sec-websocket-protocol': previewWebSocketProtocol(metadata.profile) }
        : {}),
    },
  });
  proxy.on('error', close);
  proxy.on('response', close);
  proxy.on('upgrade', (reply, socket, pending) => {
    if (
      client.destroyed ||
      reply.statusCode !== 101 ||
      reply.headers['sec-websocket-protocol'] !== previewWebSocketProtocol(metadata.profile)
    ) {
      socket.destroy();
      close();
      return;
    }
    upstream = socket;
    upstream.on('error', close);
    upstream.once('close', close);
    client.write(
      `HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${reply.headers['sec-websocket-accept']}\r\n${previewWebSocketProtocol(metadata.profile) ? 'Sec-WebSocket-Protocol: vite-hmr\r\n' : ''}\r\n`,
    );
    let sent = head.length;
    let received = pending.length;
    client.on('data', (data) => {
      sent += data.length;
      if (sent > 2 * 1024 * 1024) close();
    });
    upstream.on('data', (data) => {
      received += data.length;
      if (received > 2 * 1024 * 1024) close();
    });
    if (head.length) upstream.write(head);
    if (pending.length) client.write(pending);
    client.pipe(upstream).pipe(client);
  });
  timer = setTimeout(close, 10000);
  proxy.end();
});
bridge.requestTimeout = 10000;
bridge.headersTimeout = 10000;
bridge.maxHeadersCount = 32;
await new Promise((resolve, reject) => {
  bridge.once('error', reject);
  bridge.listen(4175, '127.0.0.1', resolve);
});
let browser;
try {
  await marker();
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  const diagnostics = [];
  const consoleErrors = [];
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && consoleErrors.length < 8)
      consoleErrors.push(message.text().slice(0, 512));
  });
  const diagnostic = (message) => {
    if (diagnostics.length < 8) diagnostics.push(message.slice(0, 512));
  };
  const contract = nextWorkspace(metadata.workspaceId);
  const weather = contract?.goal === 'loading-error-not-found';
  page.on('pageerror', (error) => {
    // 制御データの予定された初回失敗は、error画面と実再取得を別途観測する。
    if (weather && error.message === '教材データの読み込み失敗') return;
    diagnostic(error.message);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    // 意図したerror画面のdev診断は拒否したまま、教材の取得失敗と区別する。
    const diagnosticDenied =
      weather &&
      response.status() === 403 &&
      url.origin === origin &&
      url.search === '' &&
      ((response.request().method() === 'GET' &&
        url.pathname === '/__nextjs_font/geist-latin.woff2') ||
        (response.request().method() === 'POST' &&
          url.pathname === '/__nextjs_original-stack-frames'));
    const missing =
      weather &&
      new URL(response.url()).pathname === base + 'weather/missing' &&
      response.status() === 404;
    if (response.status() >= 400 && !missing && !diagnosticDenied)
      diagnostic(`HTTP resource failed: ${response.status()}`);
  });
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText ?? 'unknown';
    if (error !== 'net::ERR_ABORTED') diagnostic(`HTTP resource failed: ${error}`);
  });
  const response = await page.goto(origin + base, { waitUntil: 'load', timeout: 5000 });
  if (response.status() !== 200) diagnostic(`HTTP page failed: ${response.status()}`);
  // Viteの反映に伴う再読込も含め、実HTTP資源が静止してから同じ文書のDOMを読む。
  await page.waitForLoadState('networkidle', { timeout: 3000 });
  assert.equal(new URL(page.url()).origin, origin);
  let documentNavigation = navigations;
  const heading = page.locator('h1#message');
  const count = await heading.count();
  const visible = count === 1 && (await heading.isVisible());
  const actual = count === 1 ? ((await heading.textContent()) ?? '').trim().slice(0, 512) : '';
  const next = metadata.profile === 'next-project-v1';
  let httpMatches = true;
  const httpActual = [];
  const controlledData = ['data-cache-revalidation', 'loading-error-not-found'].includes(
    contract?.goal,
  );
  let lessonObservation;
  if (contract && contract.goal !== 'page-route-query' && !diagnostics.length) {
    try {
      lessonObservation = controlledData
        ? await observeNextData(page, origin, base, contract.goal, readHttp, completedResponse)
        : await observeNextLesson(page, origin, base, contract.goal);
    } catch (error) {
      if (!(error instanceof NextLessonObservationError)) throw error;
      diagnostic(error.message);
    }
    documentNavigation = navigations;
  }
  if (next && contract?.goal === 'page-route-query') {
    for (const [path, expected] of [
      ['api/question', '最初の実リクエスト'],
      ['api/question?mode=second', '2つ目の実リクエスト'],
    ]) {
      try {
        const reply = await readHttp(`${base}${path}`);
        if (reply.status !== 200 || !reply.type?.startsWith('application/json')) {
          diagnostic(`Route Handler HTTP failed: ${reply.status}`);
          httpMatches = false;
          continue;
        }
        const observed = JSON.parse(reply.body.toString());
        const message = typeof observed.message === 'string' ? observed.message.slice(0, 128) : '';
        httpActual.push(message);
        if (message !== expected) httpMatches = false;
      } catch {
        diagnostic('Route HandlerのJSON応答を確認できません。');
        httpMatches = false;
      }
    }
  }
  await marker();
  if (documentNavigation !== navigations)
    diagnostic('採点中に文書が切り替わりました。もう一度判定してください。');
  process.stdout.write(
    JSON.stringify({
      ...metadata,
      status: diagnostics.length
        ? 'code-error'
        : (
              lessonObservation
                ? lessonObservation.passed
                : visible &&
                  actual === (next ? 'こんにちは、Next.js！' : 'こんにちは、実サーバー！') &&
                  httpMatches
            )
          ? 'pass'
          : 'incomplete',
      actual:
        lessonObservation?.actual ??
        (next ? `${actual} / ${httpActual.join(' / ')}`.slice(0, 512) : actual),
      diagnostics,
      // Consoleは合否の入力にせず、失敗時の原因をboundedに観察する情報だけとする。
      observation: { count, visible, navigations, consoleErrors },
      engineVersion: browser.version(),
      evaluatedAt: new Date().toISOString(),
    }) + '\n',
  );
} finally {
  await browser?.close();
  websockets.forEach((close) => close());
  bridge.closeAllConnections();
  bridge.close();
}
