import { randomUUID } from 'node:crypto';
import { isNextForm } from './next-form-preview.mjs';
import { readPreviewBody } from './preview-body.mjs';
import { observeNextProduction } from './next-production-observations.mjs';
import { observeNextForm } from './next-form-observations.mjs';
import { createNextFormResponses } from './next-form-response.mjs';
import { watchNextFormReceipts } from './next-form-receipts.mjs';
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
import { URL, URLSearchParams } from 'node:url';
import { chromium } from '@playwright/test';
import { nextWorkspace } from './next-project-protocol.mjs';
import {
  NextLessonObservationError,
  observeNextLesson,
  watchDocumentVersion,
} from './next-project-observations.mjs';
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

const form = isNextForm(metadata.workspaceId);
const action = nextWorkspace(metadata.workspaceId)?.goal === 'server-action-validation';
let formLease;
const formMemo = `memo-${randomUUID().slice(0, 8)}`;
async function formControl(op) {
  const parameters = new URLSearchParams({
    op,
    leaseId: formLease,
    runId: metadata.runId,
    sourceRevision: String(metadata.sourceRevision),
    sourceHash: metadata.sourceHash,
    ...(op === 'reserve' ? { memo: formMemo } : {}),
  });
  const reply = await readHttp(`/__tsumucode_note?${parameters}`);
  if (op === 'reserve' && reply.status === 409) throw new Error('Form reservation busy');
  assert.equal(reply.status, 200);
  return JSON.parse(reply.body.toString());
}
let requests = 0;
let formRequestNumber = 0;
const formResponses = createNextFormResponses(origin);
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
const bridge = createServer(async (req, res) => {
  if (
    requests >= 8 ||
    !(req.method === 'GET' || (form && nextPreviewRequest(req, metadata)?.post)) ||
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
  const formResponse = policy.post && action ? formResponses.begin(req.method, req.url) : undefined;
  const formRequest = policy.post ? ++formRequestNumber : 0;
  // 同じURLへの連続POSTを区別する。本文・URL・入力・予約IDは診断に含めない。
  const formResponseEvent = (event) => {
    if (formRequest >= 1 && formRequest <= 8)
      process.stderr.write(
        `TSUMUCODE_FORM_RESPONSE:${formRequest}:${event}:${Date.now() - started}\n`,
      );
  };
  formResponseEvent('request-start');
  res.once('finish', () => formResponseEvent('downstream-finished'));
  let timer;
  let upstream;
  const cancellation = new globalThis.AbortController();
  req.once('aborted', () => {
    if (formResponse) formResponse.failed = true;
  });
  res.once('close', () => {
    if (formResponse && !res.writableFinished) formResponse.failed = true;
    if (!res.writableFinished) formResponseEvent('closed-before-finish');
    cancellation.abort();
    if (!req.complete) req.destroy();
    clearTimeout(timer);
    requests--;
    upstream?.destroy();
  });
  const fail = () => {
    if (formResponse) formResponse.failed = true;
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) res.destroy();
    else res.writeHead(503).end();
  };
  timer = setTimeout(() => {
    fail();
    cancellation.abort();
    upstream?.destroy();
  }, 10000);
  let body;
  if (policy.post) {
    try {
      body = await readPreviewBody(req, {
        limit: 64 * 1024,
        timeoutMs: 10000,
        signal: cancellation.signal,
      });
    } catch {
      fail();
      return;
    }
  }
  if (res.destroyed || res.writableEnded) return;
  upstream = request(
    {
      socketPath: '/transport/http.sock',
      path: req.url,
      method: req.method,
      headers: {
        host: new URL(origin).host,
        ...policy.headers,
        ...(policy.post
          ? {
              origin,
              'content-type': req.headers['content-type'],
              'x-tsumucode-note-lease': formLease,
            }
          : {}),
      },
    },
    (reply) => {
      if (formResponse) formResponse.status = reply.statusCode;
      reply.once('end', () => formResponseEvent('upstream-end'));
      forwardPreviewResponse(reply, res, {
        method: req.method,
        headers: {
          ...previewHeaders(metadata.runId, metadata.profile),
          ...(formResponse ? { 'x-tsumucode-form-response': String(formRequest) } : {}),
        },
        limit: previewResponseLimit(req.url, metadata),
        stream: policy.stream,
        // 採点ではActionの有限RSC全量を固定長で渡す。公開Proxyの逐次応答は変更しない。
        bufferStream: action && policy.post,
        fail,
        complete: () => {
          if (formResponse && !formResponse.failed) formResponse.complete = true;
          if (req.headers.rsc === '1') completedResponses.set(req.url, true);
        },
      });
    },
  );
  upstream.on('error', fail);
  upstream.end(body);
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
let formReceipts = () => [];
const emitFormReceipt = (receipt) =>
  process.stderr.write(
    `TSUMUCODE_FORM_RECEIPT:${receipt.request}:${receipt.bridgeRequest}:${receipt.status}:${receipt.expectedBytes}:${receipt.receivedBytes}:${receipt.state}:${receipt.encoding}\n`,
  );
let phase;
const started = Date.now();
function step(value) {
  phase = value;
  process.stderr.write(`TSUMUCODE_GRADE_STEP:${phase}:${Date.now() - started}\n`);
}
step('marker-before');
try {
  await marker();
  if (form) {
    step('form-reserve');
    formLease = randomUUID();
    await formControl('reserve');
  }
  step('browser-launch');
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  if (action) formReceipts = await watchNextFormReceipts(page, origin, base, emitFormReceipt);
  const diagnostics = [];
  const consoleErrors = [];
  let navigations = 0;
  const documentVersion = watchDocumentVersion(page);
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
  const browserFormRequests = new WeakMap();
  const browserFormEvent = (request, event) => {
    const sequence = browserFormRequests.get(request);
    if (sequence)
      process.stderr.write(
        `TSUMUCODE_FORM_RESPONSE:${sequence}:${event}:${Date.now() - started}\n`,
      );
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
    const sequence = response.headers()['x-tsumucode-form-response'];
    if (action && /^[1-8]$/u.test(sequence ?? '')) {
      browserFormRequests.set(response.request(), Number(sequence));
      browserFormEvent(response.request(), 'browser-response');
    }
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
    const expectedFormFailure =
      form &&
      metadata.workspaceId === 'next-ch04-l01-e01' &&
      url.origin === origin &&
      url.pathname === `${base}api/note` &&
      url.search === '' &&
      response.request().method() === 'POST' &&
      [400, 503].includes(response.status());
    if (response.status() >= 400 && !missing && !diagnosticDenied && !expectedFormFailure)
      diagnostic(`HTTP resource failed: ${response.status()}`);
  });
  page.on('requestfinished', (request) => browserFormEvent(request, 'browser-finished'));
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText ?? 'unknown';
    const url = new URL(request.url());
    const actionPost =
      action &&
      request.method() === 'POST' &&
      url.origin === origin &&
      [base.slice(0, -1), base].includes(url.pathname) &&
      url.search === '';
    browserFormEvent(request, error === 'net::ERR_ABORTED' ? 'browser-aborted' : 'browser-failed');
    if (error !== 'net::ERR_ABORTED' || actionPost) diagnostic(`HTTP resource failed: ${error}`);
  });
  step('initial-navigation');
  const response = await page.goto(origin + base, { waitUntil: 'load', timeout: 5000 });
  if (response.status() !== 200) diagnostic(`HTTP page failed: ${response.status()}`);
  // Formは後続の実POST全量完了・DOM・保存履歴で準備を確認する。
  // 固定500msのnetworkidle待ちを重ねず、他教材の文書静止契約は維持する。
  step('initial-idle');
  if (!form) await page.waitForLoadState('networkidle', { timeout: 3000 });
  assert.equal(new URL(page.url()).origin, origin);
  let documentNavigation = documentVersion();
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
  step('observations');
  if (contract && contract.goal !== 'page-route-query' && !diagnostics.length) {
    try {
      lessonObservation = form
        ? await observeNextForm(
            page,
            origin,
            base,
            contract.goal,
            formMemo,
            formControl,
            step,
            formResponses.completed,
          )
        : contract.ruleGoals
          ? await observeNextProduction(page, origin, base, contract.goal, step)
          : controlledData
            ? await observeNextData(page, origin, base, contract.goal, readHttp, completedResponse)
            : await observeNextLesson(page, origin, base, contract.goal);
    } catch (error) {
      if (!(error instanceof NextLessonObservationError)) throw error;
      diagnostic(error.message);
    }
    if (form)
      step(
        documentNavigation === documentVersion()
          ? 'form-document-unchanged'
          : 'form-document-changed',
      );
    // Form/Actionは同じ文書のまま送信する。観測中のreloadを基準更新で消さない。
    if (!form) documentNavigation = documentVersion();
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
  step('marker-after');
  await marker();
  // Nextの同一URLへのreplaceStateは文書切替ではない。実reloadと別URLは拒否する。
  if (documentNavigation !== documentVersion())
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
      ...(contract?.ruleGoals
        ? {
            projectChecks:
              (diagnostics.length ? undefined : lessonObservation?.projectChecks) ??
              contract.ruleGoals.map((goal) => ({
                goal,
                passed: false,
                actual: '工程の実観測を完了できません。',
              })),
          }
        : {}),
      // Consoleは合否の入力にせず、失敗時の原因をboundedに観察する情報だけとする。
      observation: { count, visible, navigations, consoleErrors },
      engineVersion: browser.version(),
      evaluatedAt: new Date().toISOString(),
    }) + '\n',
  );
} catch (error) {
  // 失敗段階だけを固定語彙で返し、learnerのSourceや例外本文を公開しない。
  process.stderr.write(`TSUMUCODE_GRADE_PHASE:${phase}\n`);
  // 例外本文は出さず、基盤障害と文書・DOM観測の失敗を固定分類で区別する。
  const message = error instanceof Error ? error.message : '';
  const reason =
    message === 'Form reservation busy'
      ? 'form-busy'
      : message === 'Grade HTTP deadline'
        ? 'http-deadline'
        : /ECONNRESET|ECONNREFUSED|EPIPE|socket hang up/u.test(message)
          ? 'http-connection'
          : /Execution context was destroyed|Cannot find context with specified id/u.test(message)
            ? 'document-context'
            : /Target page, context or browser has been closed/u.test(message)
              ? 'browser-closed'
              : /strict mode violation/u.test(message)
                ? 'dom-contract'
                : error?.code === 'ERR_ASSERTION'
                  ? 'identity'
                  : 'unknown';
  process.stderr.write(`TSUMUCODE_GRADE_FAILURE:${reason}\n`);
  throw error;
} finally {
  formReceipts().forEach(emitFormReceipt);
  step('browser-close');
  await browser?.close();
  step('form-release');
  if (formLease) await formControl('release').catch(() => {});
  websockets.forEach((close) => close());
  bridge.closeAllConnections();
  bridge.close();
}
