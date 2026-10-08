import assert from 'node:assert/strict';
import { bridge } from './browser-test-bridge.mjs';
import { request } from 'node:http';
import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { STARTER_FILES } from './project-protocol.mjs';

/* global document, parent, fetch, localStorage, indexedDB, Worker, WebSocket, Blob, URL, getComputedStyle, setTimeout, clearTimeout */

const bridges = [await bridge(4173, 'web'), await bridge(4175, 'preview')];
await mkdir('.release-issue125', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext();
const page = await context.newPage();
const frames = [];
const passed = [];
const id = `browser-${Date.now()}`;
const path = `/api/workspaces/${id}`;
let token;
let run;

async function api(url, input = {}) {
  return page.evaluate(
    async ({ url, input, token }) => {
      const reply = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-tsumucode-token': token } : {}),
        },
        body: JSON.stringify(input),
      });
      return { status: reply.status, value: await reply.json() };
    },
    { url, input, token },
  );
}

async function ready() {
  for (let index = 0; index < 100; index++) {
    const result = await api(path);
    if (result.value.lastRun?.state === 'ready') return result.value;
    if (result.value.lastRun?.state === 'failed')
      throw new Error(`Run failed: ${result.value.lastRun.reason}`);
    await delay(200);
  }
  throw new Error('Preview readiness deadline');
}

async function iframe(url, name) {
  const navigation = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame.name() === name && frame.url() === url,
  });
  await page.evaluate(
    ({ url, name }) => {
      const frame = document.createElement('iframe');
      frame.name = name;
      frame.title = '実Workspace Preview';
      frame.sandbox = 'allow-scripts allow-same-origin allow-forms';
      frame.src = url;
      frame.width = '700';
      frame.height = '420';
      document.body.append(frame);
    },
    { url, name },
  );
  const frame = await navigation;
  await frame.waitForSelector('#message');
  return frame;
}

/** raw pathを正規化せず実proxyへ送り、固定Host/Origin境界を確認する。 */
function previewRequest(url, host, origin, method = 'GET', body = '') {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 4175,
        path: url,
        method,
        headers: {
          host,
          ...(origin ? { origin } : {}),
          ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (data) => {
          text += data;
        });
        res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

try {
  await page.goto('http://127.0.0.1:4173/');
  token = (await api('/api/session')).value.token;
  assert.equal(typeof token, 'string');
  await context.addCookies([
    { name: 'admin-fixture', value: 'keep', url: 'http://127.0.0.1:4173/' },
  ]);
  const files = {
    ...STARTER_FILES,
    'index.html': STARTER_FILES['index.html'].replace(
      '<main>',
      '<main><input id="retained" aria-label="HMR保持確認" />',
    ),
    'main.js': `import { message } from './message.js';
import './styles.css';
const render = (value) => { document.querySelector('#message').textContent = value; };
render(message);
if (import.meta.hot) import.meta.hot.accept('./message.js', (module) => render(module.message));
`,
    'message.js': "export const message = 'before-hmr';\n",
    'styles.css': 'body { color: rgb(10, 20, 30); }\n',
  };
  assert.equal((await api(`${path}/source`, { expectedSourceRevision: 0, files })).status, 200);
  run = (await api(`${path}/start`, { expectedSourceRevision: 1 })).value;
  const first = await ready();
  const url = first.lastRun.previewUrl;
  assert.ok(!url.includes(token));
  const origin = new URL(url).origin;
  const host = new URL(url).host;
  page.on('websocket', (socket) => {
    const record = { url: socket.url(), messages: [], closed: false };
    frames.push(record);
    socket.on('framereceived', (event) => record.messages.push(String(event.payload)));
    socket.on('close', () => {
      record.closed = true;
    });
  });
  const firstFrame = await iframe(url, 'first-preview');
  assert.equal(await firstFrame.locator('#message').textContent(), 'before-hmr');
  await firstFrame.locator('#retained').fill('retain-across-hmr');
  for (
    let index = 0;
    index < 50 &&
    !frames.some((frame) => frame.messages.some((text) => text.includes('connected')));
    index++
  )
    await delay(100);
  assert.ok(
    frames.some(
      (frame) =>
        frame.url.startsWith(origin.replace('http:', 'ws:')) &&
        frame.messages.some((text) => text.includes('connected')),
    ),
  );
  assert.ok(frames.every((frame) => !frame.url.includes(':5173')));
  passed.push('real-browser-iframe-http-and-vite-websocket');

  const changed = {
    ...files,
    'message.js': "export const message = 'after-hmr';\n",
    'styles.css': 'body { color: rgb(30, 40, 50); }\n',
  };
  const saved = (await api(`${path}/source`, { expectedSourceRevision: 1, files: changed })).value;
  assert.equal(saved.lastRun.sourceRevision, 1);
  const applied = await api(`${path}/apply`, {
    runId: run.runId,
    expectedSourceRevision: saved.sourceRevision,
    expectedSourceHash: saved.sourceHash,
  });
  assert.equal(applied.status, 200);
  assert.equal(applied.value.lastRun.sourceHash, saved.sourceHash);
  await firstFrame.waitForFunction(
    () => document.querySelector('#message')?.textContent === 'after-hmr',
  );
  await firstFrame.waitForFunction(
    () => getComputedStyle(document.body).color === 'rgb(30, 40, 50)',
  );
  assert.equal(await firstFrame.locator('#retained').inputValue(), 'retain-across-hmr');
  assert.ok(frames.some((frame) => frame.messages.some((text) => text.includes('update'))));
  passed.push('saved-applied-revision-and-real-dom-css-hmr');

  const echo = await firstFrame.evaluate(async () => {
    const res = await fetch('api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'message=form-proof',
    });
    return { status: res.status, text: await res.text() };
  });
  assert.deepEqual(echo, { status: 200, text: 'message=form-proof' });
  for (const route of [
    '/api/session',
    '/api/workspaces/other',
    `${new URL(url).pathname}%2e%2e/main.js`,
    `${new URL(url).pathname}@fs/etc/passwd`,
  ])
    assert.equal((await previewRequest(route, host, origin)).status, 403);
  assert.equal(
    (await previewRequest(new URL(url).pathname, host, 'http://127.0.0.1:4173')).status,
    403,
  );
  passed.push('real-form-http-and-proxy-route-origin-denials');

  const attacks = await firstFrame.evaluate(async (path) => {
    let parentDenied = false;
    let workerDenied;
    try {
      void parent.document.body;
    } catch {
      parentDenied = true;
    }
    const denied = [];
    for (const route of ['/api/session', `${path}/source`, `${path}-other/source`]) {
      try {
        await fetch(`http://127.0.0.1:4173${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedSourceRevision: 0, files: {} }),
        });
        denied.push(false);
      } catch {
        denied.push(true);
      }
    }
    const bootstrapDenied = denied.every(Boolean);
    workerDenied = await new Promise((resolve) => {
      const url = URL.createObjectURL(
        new Blob(['self.postMessage("worker-ran")'], { type: 'text/javascript' }),
      );
      let worker;
      const finished = (value) => {
        clearTimeout(timer);
        document.removeEventListener('securitypolicyviolation', blocked);
        worker?.terminate();
        URL.revokeObjectURL(url);
        resolve(value);
      };
      const blocked = (event) => {
        if (event.effectiveDirective === 'worker-src') finished(true);
      };
      const timer = setTimeout(() => finished(false), 1000);
      document.addEventListener('securitypolicyviolation', blocked);
      try {
        worker = new Worker(url);
        worker.onmessage = () => finished(false);
      } catch {
        // constructorが同期throwするBrowserでも、実際のCSP違反eventを確認する。
      }
    });
    document.cookie = 'own=first; Path=/';
    document.cookie = 'escape=bad; Domain=localhost; Path=/';
    document.cookie = 'admin-fixture=bad; Domain=127.0.0.1; Path=/';
    localStorage.setItem('private', 'first');
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('first-private', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('store');
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = reject;
    });
    return { parentDenied, bootstrapDenied, workerDenied, cookie: document.cookie };
  }, path);
  assert.equal(attacks.parentDenied, true);
  assert.equal(attacks.bootstrapDenied, true);
  assert.equal(attacks.workerDenied, true);
  assert.deepEqual((await api(path)).value.files, changed);
  assert.equal((await api(`${path}-other`)).status, 404);
  // iframeの第三者Cookie制限とは別に、直接表示したPreviewでhost Cookie境界を検証する。
  const direct = await context.newPage();
  await direct.goto(url);
  const cookie = await direct.evaluate(() => {
    document.cookie = 'own=first; Path=/';
    document.cookie = 'escape=bad; Domain=localhost; Path=/';
    document.cookie = 'admin-fixture=bad; Domain=127.0.0.1; Path=/';
    return document.cookie;
  });
  assert.equal(cookie, 'own=first');
  assert.equal(await direct.evaluate(() => localStorage.getItem('private')), 'first');
  const directBootstrap = await direct.evaluate(async () => {
    try {
      await fetch('http://127.0.0.1:4173/api/session', { method: 'POST' });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(directBootstrap, true);
  await direct.close();
  await delay(200);
  // 同じ実runへの切断/再接続でも、固定OriginとVite protocolでconnectedを受信する。
  const websocketUrl = frames.find((frame) =>
    frame.messages.some((text) => text.includes('connected')),
  ).url;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reconnected = await firstFrame.evaluate(
      (url) =>
        new Promise((resolve) => {
          const socket = new WebSocket(url, 'vite-hmr');
          const timer = setTimeout(() => {
            socket.close();
            resolve(false);
          }, 2000);
          socket.onmessage = (event) => {
            if (JSON.parse(event.data).type === 'connected') {
              clearTimeout(timer);
              socket.close();
              resolve(true);
            }
          };
          socket.onerror = () => {
            clearTimeout(timer);
            resolve(false);
          };
        }),
      websocketUrl,
    );
    assert.equal(
      reconnected,
      true,
      JSON.stringify(
        frames.map((frame) => ({
          closed: frame.closed,
          messages: frame.messages.map((text) => {
            try {
              return JSON.parse(text).type;
            } catch {
              return 'non-json';
            }
          }),
        })),
      ),
    );
    await delay(100);
  }
  assert.equal(
    (await context.cookies('http://127.0.0.1:4173/')).find(
      (cookie) => cookie.name === 'admin-fixture',
    ).value,
    'keep',
  );
  passed.push('browser-management-bootstrap-cookie-and-worker-boundary');
  await page.screenshot({ path: '.release-issue125/preview-hmr.png', fullPage: true });

  assert.equal((await api(`${path}/stop`, { runId: run.runId })).status, 200);
  for (let index = 0; index < 30 && !frames.every((frame) => frame.closed); index++)
    await delay(100);
  assert.ok(frames.every((frame) => frame.closed));
  assert.equal((await previewRequest(new URL(url).pathname, host, origin)).status, 503);
  run = (await api(`${path}/start`, { expectedSourceRevision: saved.sourceRevision })).value;
  const second = await ready();
  assert.notEqual(second.lastRun.previewUrl, url);
  assert.equal((await previewRequest(new URL(url).pathname, host, origin)).status, 403);
  const secondFrame = await iframe(second.lastRun.previewUrl, 'second-preview');
  const secondDirect = await context.newPage();
  await secondDirect.goto(second.lastRun.previewUrl);
  assert.equal(await secondDirect.evaluate(() => document.cookie), '');
  await secondDirect.close();
  const isolation = await secondFrame.evaluate(async () => ({
    cookie: document.cookie,
    storage: localStorage.getItem('private'),
    databases: (await indexedDB.databases()).map((db) => db.name),
  }));
  assert.deepEqual(isolation, { cookie: '', storage: null, databases: [] });
  passed.push('stop-websocket-close-new-run-reconnect-and-storage-isolation');
  const formNavigation = secondFrame.waitForNavigation();
  await secondFrame.evaluate(() => {
    const form = document.createElement('form');
    form.action = 'api/echo';
    form.method = 'POST';
    const input = document.createElement('input');
    input.name = 'message';
    input.value = 'native-form-proof';
    form.append(input);
    document.body.append(form);
    form.requestSubmit();
  });
  const formResponse = await formNavigation;
  const formHeaders = await formResponse.request().allHeaders();
  assert.equal(
    formResponse.status(),
    200,
    JSON.stringify({
      origin: formHeaders.origin,
      type: formHeaders['content-type'],
      path: new URL(formResponse.url()).pathname,
    }),
  );
  assert.equal(await secondFrame.locator('body').textContent(), 'message=native-form-proof');
  passed.push('native-browser-form-submit');
  process.stdout.write(
    `${JSON.stringify({ passed, browser: browser.version(), node: process.version, profile: 'vite-project-v1' }, null, 2)}\n`,
  );
} finally {
  try {
    if (run?.runId) await api(`${path}/stop`, { runId: run.runId });
  } finally {
    await browser.close();
    for (const server of bridges) server.closeAllConnections();
    for (const server of bridges) server.close();
  }
}
