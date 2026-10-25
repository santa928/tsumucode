import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { parse } from 'yaml';
import { bridge } from './browser-test-bridge.mjs';
import {
  cookieNetworkErrorClass,
  installChromiumObserver,
} from './next-cookie-transport-observations.mjs';
import {
  completeActionReader,
  installActionReaderObservation,
} from './next-cookie-reader-observation.mjs';
import { previewOrigin, previewBase } from './preview-contract.mjs';
import { FORM_WORKSPACE, ACTION_WORKSPACE } from './next-form-preview.mjs';
import { watchDocumentVersion } from './next-project-observations.mjs';
import {
  cleanupCookieAcceptance,
  finishCookieResponse,
  withCookieDeadline,
} from './next-form-cookie-lifecycle.mjs';

// 作者/CI専用。Cookie jarやfetchを模擬せず、実NextのServerコードとBrowserの送信で検証する。
const bridges = [];
let browser;
let context;
let transportObserver;
let manager;
const navigationCounts = new WeakMap();
const documentVersions = new WeakMap();
const browserEvents = { requestFailed: 0, pageError: 0 };
const passed = [];
let sequence = 0;
let token;
let active;
let workspace = 'setup';
let currentStage = 'initialization';
let failure;
const startedAt = performance.now();
// 手動の限定再現だけで使い、通常の受入・採点と区別する。
const limitedReproduction = process.env.TSUMUCODE_COOKIE_REPRODUCTION === 'action-47';
const readerObserverEnabled = limitedReproduction && process.env.TSUMUCODE_COOKIE_READER === '1';

/** 固定の段階と成否だけを記録し、URL・Cookie・token・Source本文を出力しない。 */
function progress(stage, outcome) {
  currentStage = stage;
  console.log(
    JSON.stringify({
      event: 'cookie-acceptance',
      stage,
      outcome,
      workspace,
      sequence,
      elapsedMs: Math.round(performance.now() - startedAt),
    }),
  );
}

/** 開始と完了を対応付け、HTTP完了やBrowser protocolの無期限待機を失敗にする。 */
async function step(stage, operation, timeoutMs = 30000) {
  progress(stage, 'started');
  try {
    const result = await withCookieDeadline(operation, timeoutMs, stage);
    progress(stage, 'completed');
    return result;
  } catch (error) {
    progress(stage, error.name === 'CookieAcceptanceDeadlineError' ? 'deadline' : 'failed');
    throw error;
  }
}

// cleanup後の孤立handleも有限にする。正常終了をtimerだけで引き延ばさない。
setTimeout(() => {
  progress(currentStage, 'process-deadline');
  process.exit(1);
}, 240000).unref();

/** 管理APIだけに管理tokenを付ける。Preview操作にはこのAPIRequestContextを使わない。 */
async function api(path, value = {}, timeoutMs = 30000) {
  const operation = async () => {
    const response = await context.request.post(`http://127.0.0.1:4173${path}`, {
      headers: {
        origin: 'http://127.0.0.1:4173',
        ...(token ? { 'x-tsumucode-token': token } : {}),
      },
      data: value,
      timeout: timeoutMs,
    });
    assert.ok(response.ok(), `Cookie author API ${path}: ${response.status()}`);
    return response.json();
  };
  const action = path.split('/').at(-1);
  // 固定API名だけを記録する。readinessのGET相当pollは段階ログを増やさない。
  return ['session', 'source', 'start', 'apply', 'grade', 'stop'].includes(action)
    ? step(`api-${action}`, operation, timeoutMs)
    : withCookieDeadline(operation, timeoutMs, 'control-api');
}

/** 自分の検証runだけを起動し、既存のready契約を待つ。 */
async function start(workspaceId, sourceRevision) {
  const path = `/api/workspaces/${workspaceId}`;
  const deadline = performance.now() + 30000;
  const remaining = () => Math.max(1, deadline - performance.now());
  const started = await step('run-start', () =>
    api(`${path}/start`, { expectedSourceRevision: sourceRevision }, remaining()),
  );
  active = { path, runId: started.runId };
  progress('readiness', 'started');
  while (performance.now() < deadline) {
    const saved = await api(path, {}, remaining());
    assert.equal(saved.lastRun.runId, active.runId);
    if (saved.lastRun.state === 'ready') {
      progress('readiness', 'completed');
      return saved;
    }
    assert.notEqual(saved.lastRun.state, 'failed', 'Cookie fixture run failed');
    await delay(Math.min(200, remaining()));
  }
  progress('readiness', 'deadline');
  assert.fail('Cookie fixture readiness deadline');
}

/** 診断用markerを実Documentに一度だけ置く。初期値なしの照合では再生成しない。 */
async function documentMarker(frame, initial) {
  return frame.evaluate((value) => {
    const key = '__tsumucodeAuthorCookieDocument';
    if (value && !Object.hasOwn(globalThis.document, key))
      Object.defineProperty(globalThis.document, key, { value });
    return globalThis.document[key] ?? null;
  }, initial);
}

/** Actor自身の文書・route・入力を照合し、HTTP完了とClientの表示を別々に検証する。 */
async function submit(surface, input, expected) {
  const frame = surface.mainFrame?.() ?? surface;
  const actorUrl = new URL(frame.url());
  const form = actorUrl.pathname.includes(FORM_WORKSPACE);
  const routes = form
    ? [new URL('api/note', actorUrl).href]
    : [actorUrl.href, actorUrl.href.replace(/\/$/u, '')];
  let version = documentVersions.get(frame);
  if (!version) {
    version = watchDocumentVersion(frame.page(), frame);
    documentVersions.set(frame, version);
  }
  let marker;
  const currentSequence = ++sequence;
  // readは毎回固有入力にし、前のsaved表示を次の成功へ流用しない。
  const requestInput = input.startsWith('read') ? `${input}-${currentSequence}` : input;
  const snapshot = {
    sequence: currentSequence,
    workspace: form ? 'form' : 'action',
    surface: surface === frame ? 'iframe' : 'tab',
    stage: input,
    navigationEventsBefore: navigationCounts.get(frame) ?? 0,
    documentVersionBefore: version(),
    ...browserEvents,
  };
  const field = frame.getByLabel('メモ', { exact: true });
  let reply;
  let selectedRequest;
  let readerOrdinal;
  let readerLength;
  const candidates = [];
  transportObserver.begin(frame, currentSequence, routes, requestInput);
  /** 送信前から候補だけを追跡する。本文を出さず、入力の包含も診断にだけ使う。 */
  const onRequest = (request) => {
    if (request.method() !== 'POST' || request.frame() !== frame || !routes.includes(request.url()))
      return;
    const body = request.postDataBuffer();
    candidates.push({
      request,
      inputIncluded: body ? body.includes(Buffer.from(requestInput)) : null,
      startedMs: Math.round(performance.now() - startedAt),
      terminal: 'pending',
    });
  };
  /** 同じRequest objectの終端だけを対応付け、別通信の失敗を混ぜない。 */
  const terminal = (request, state) => {
    const candidate = candidates.find((item) => item.request === request);
    if (!candidate) return;
    candidate.terminal = state;
    candidate.terminalMs = Math.round(performance.now() - startedAt);
    if (state === 'failed')
      candidate.errorClass = cookieNetworkErrorClass(request.failure()?.errorText);
  };
  const onFinished = (request) => terminal(request, 'finished');
  const onFailed = (request) => terminal(request, 'failed');
  /** 固定分類・連番・boolean・時刻だけを残し、Request/URL/資格情報は出力しない。 */
  const requestSnapshot = () =>
    candidates.map(({ request, ...observation }, index) => ({
      ordinal: index + 1,
      selected: request === selectedRequest,
      ...observation,
    }));
  context.on('request', onRequest);
  context.on('requestfinished', onFinished);
  context.on('requestfailed', onFailed);
  try {
    progress('submit-start', 'started');
    marker = await step('document-marker', () => documentMarker(frame, randomUUID()), 5000);
    assert.equal(typeof marker, 'string');
    await step(
      'fill',
      async () => {
        await expect(field).toBeEnabled();
        await field.fill(requestInput, { timeout: 15000 });
      },
      20000,
    );
    reply = context.waitForEvent('response', {
      predicate: (response) => {
        const request = response.request();
        return (
          request.method() === 'POST' &&
          request.frame() === frame &&
          routes.includes(response.url()) &&
          (!form || request.postDataJSON()?.input === requestInput)
        );
      },
      timeout: 15000,
    });
    // 操作が失敗しても、先に登録した待機のrejectを未処理にしない。
    void reply.catch(() => {});
    await step(
      'press',
      () =>
        frame
          .getByRole('button', { name: '保存する', exact: true })
          .press('Enter', { timeout: 15000 }),
      15000,
    );
    const response = await step('response-headers', () => reply, 15000);
    selectedRequest = response.request();
    if (readerObserverEnabled && !form) {
      const headers = response.headers();
      const ordinal = headers['x-tsumucode-cookie-observation'];
      const length = headers['content-length'];
      readerOrdinal = /^[1-9]\d{0,8}$/u.test(ordinal ?? '') ? Number(ordinal) : null;
      readerLength = /^\d{1,6}$/u.test(length ?? '') ? Number(length) : null;
    }
    snapshot.httpStatus = response.status();
    snapshot.completed =
      (await step('response-finished', () => finishCookieResponse(context, response))) === null;
    snapshot.navigationRequest = response.request().isNavigationRequest();
    assert.equal(snapshot.httpStatus, 200);
    assert.equal(snapshot.completed, true);
    assert.equal(snapshot.navigationRequest, false);
    if (form) {
      const state = await step('response-json', () => response.json(), 5000);
      snapshot.serverSaved = state.status === 'saved';
      snapshot.serverInputMatches = state.input === requestInput;
      assert.equal(snapshot.serverSaved, true);
      assert.equal(snapshot.serverInputMatches, true);
      if (expected !== undefined) assert.equal(state.message, `theme:${expected}`);
    } else {
      snapshot.actionRsc =
        response.headers()['content-type']?.startsWith('text/x-component') === true;
      assert.equal(snapshot.actionRsc, true);
    }
    const result = frame.locator('#note-result');
    await step('dom-assert', async () => {
      await expect(result).toHaveAttribute('data-state', 'saved');
      if (expected !== undefined) await expect(result).toHaveText(`theme:${expected}`);
      await expect(field).toHaveValue(requestInput);
      await expect(field).toBeEnabled();
    });
    assert.equal(frame.isDetached(), false);
    const text = await step('result-text', () => result.textContent({ timeout: 1000 }), 1500);
    snapshot.documentMatches =
      (await step('document-marker', () => documentMarker(frame), 5000)) === marker;
    snapshot.navigationEventsAfter = navigationCounts.get(frame) ?? 0;
    snapshot.documentVersionAfter = version();
    assert.equal(snapshot.documentMatches, true);
    assert.equal(snapshot.documentVersionAfter, snapshot.documentVersionBefore);
    assert.equal(frame.url(), actorUrl.href);
    console.log(
      JSON.stringify({
        ...snapshot,
        requests: requestSnapshot(),
        outcome: 'saved',
      }),
    );
    return text;
  } catch (error) {
    // 任意の診断より先に失敗を残し、診断自体も有限にする。
    progress('submit-failed', 'failed');
    // 失敗が既に確定した後だけ原子的に読む。正常操作間に待機を足さない。
    const atomicDom = await withCookieDeadline(
      () =>
        frame.evaluate(
          ({
            input,
            message,
            expectedMarker,
            url,
            requestUrl,
            requestStartedAt,
            readerOrdinal,
          }) => {
            const timing =
              typeof requestStartedAt === 'number' && requestStartedAt > 0 && requestUrl
                ? globalThis.performance
                    .getEntriesByName(requestUrl)
                    .filter(
                      (entry) =>
                        entry.initiatorType === 'fetch' &&
                        globalThis.performance.timeOrigin + entry.startTime >= requestStartedAt - 2,
                    )
                : [];
            const entry = timing.length === 1 ? timing[0] : undefined;
            const field = globalThis.document.querySelector('#note');
            const result = globalThis.document.querySelector('#note-result');
            const button = field?.form?.querySelector('button[type="submit"]');
            return {
              evaluatedAtEpochMs: Date.now(),
              observedReader:
                typeof readerOrdinal === 'number'
                  ? (globalThis.__tsumucodeActionReaderSnapshot?.(readerOrdinal) ?? null)
                  : null,
              resourceTimingCandidates: timing.length,
              resourceTiming: entry
                ? {
                    startEpochMs: globalThis.performance.timeOrigin + entry.startTime,
                    requestStartDeltaMs:
                      globalThis.performance.timeOrigin + entry.startTime - requestStartedAt,
                    responseEnd: entry.responseEnd,
                    transferSize: entry.transferSize,
                    encodedBodySize: entry.encodedBodySize,
                    decodedBodySize: entry.decodedBodySize,
                  }
                : null,
              fieldMatches: field?.value === input,
              resultSaved: result?.getAttribute('data-state') === 'saved',
              expectedMessageMatches: message === null ? null : result?.textContent === message,
              inputDisabled: field ? field.disabled : null,
              buttonDisabled: button ? button.disabled : null,
              sendingText: button
                ? /保存中|送信中|保存しています/u.test(button.textContent ?? '')
                : null,
              markerMatches: globalThis.document.__tsumucodeAuthorCookieDocument === expectedMarker,
              urlMatches: globalThis.location.href === url,
            };
          },
          {
            input: requestInput,
            message: expected === undefined ? null : `theme:${expected}`,
            expectedMarker: marker,
            url: actorUrl.href,
            requestUrl: selectedRequest?.url() ?? null,
            requestStartedAt: selectedRequest?.timing().startTime ?? null,
            readerOrdinal: readerObserverEnabled ? readerOrdinal : null,
          },
        ),
      1000,
      'diagnostic-atomic-dom',
    ).catch(() => ({ unavailable: true }));
    console.log(
      JSON.stringify({
        event: 'main-cookie-transport',
        boundary: 'dom',
        stage: 'failed-operation',
        sequence: currentSequence,
        epochMs: Date.now(),
        ...atomicDom,
        consumerEofProven: completeActionReader(
          atomicDom.observedReader,
          readerOrdinal,
          readerLength,
        ),
      }),
    );
    // Cookie・本文・URL・Sourceを出さず、文書置換と入力/結果の不一致だけ残す。
    snapshot.documentMatches = await withCookieDeadline(
      () => documentMarker(frame),
      1000,
      'diagnostic-document',
    ).then(
      (value) => typeof marker === 'string' && !frame.isDetached() && value === marker,
      () => false,
    );
    snapshot.navigationEventsAfter = navigationCounts.get(frame) ?? 0;
    snapshot.documentVersionAfter = version();
    snapshot.actorUrlMatches = frame.url() === actorUrl.href;
    snapshot.fieldMatches = await withCookieDeadline(
      () => field.inputValue({ timeout: 1000 }),
      1000,
      'diagnostic-input',
    ).then(
      (value) => value === requestInput,
      () => false,
    );
    snapshot.domState = await withCookieDeadline(
      () => frame.locator('#note-result').getAttribute('data-state', { timeout: 1000 }),
      1000,
      'diagnostic-state',
    ).catch(() => 'unavailable');
    if (!['idle', 'saved', 'invalid', 'failed', 'unavailable'].includes(snapshot.domState))
      snapshot.domState = 'unexpected';
    console.log(
      JSON.stringify({
        ...snapshot,
        requests: requestSnapshot(),
        browserEvents,
        outcome: 'failed',
      }),
    );
    throw error;
  } finally {
    transportObserver.end(frame, currentSequence);
    context.off('request', onRequest);
    context.off('requestfinished', onFinished);
    context.off('requestfailed', onFailed);
  }
}

/** 通常UIと同じiframe設定で新文書を作る。CookieやBrowser contextは変更しない。 */
async function mountEmbedded(url) {
  await step(
    'embedded-remove',
    () =>
      manager.locator('iframe[title="Cookie境界の実Next"]').evaluateAll((nodes) => {
        for (const node of nodes) node.remove();
      }),
    5000,
  );
  await step(
    'embedded-create',
    () =>
      manager.evaluate((src) => {
        const frame = globalThis.document.createElement('iframe');
        frame.title = 'Cookie境界の実Next';
        frame.sandbox = 'allow-scripts allow-same-origin allow-forms';
        frame.src = src;
        globalThis.document.body.append(frame);
      }, url),
    5000,
  );
  await step(
    'embedded-ready',
    () =>
      manager
        .frameLocator('iframe[title="Cookie境界の実Next"]')
        .locator('#note')
        .waitFor({ timeout: 15000 }),
    15000,
  );
  const embedded = manager.frames().find((candidate) => candidate.url() === url);
  assert.ok(embedded);
  await step(
    'network-idle',
    () => embedded.waitForLoadState('networkidle', { timeout: 15000 }),
    15000,
  );
  return embedded;
}

/** 公開教材には追加しない。編集可能なServerファイルで実cookies APIだけを使う診断Source。 */
function serverFixture(action) {
  const logic = `
  const jar = await cookies();
  const requestHeaders = await headers();
  if (jar.getAll().some(({ name }) => name !== 'lesson-theme') ||
      ['authorization', 'x-tsumucode-token', 'x-tsumucode-note-lease', 'forwarded'].some((key) => requestHeaders.has(key)))
    throw new Error('Credential boundary');
  const before = jar.get('lesson-theme')?.value ?? 'absent';
  if (input === 'light' || input === 'dark') jar.set('lesson-theme', input);
  if (input === 'clear') jar.delete('lesson-theme');
  const state = { status: 'saved' as const, message: 'theme:' + before, count: 1, input };
`;
  return action
    ? `'use server';
import { cookies, headers } from 'next/headers';
import type { NoteState } from './note-state';
/** 固定Cookieを実Server Actionで保存・読取・削除する作者診断。 */
export async function saveNote(_previous: NoteState, formData: FormData): Promise<NoteState> {
  const input = String(formData.get('note') ?? '');${logic}
  return state;
}
`
    : `import { cookies, headers } from 'next/headers';
/** 固定Cookieを実Route Handlerで保存・読取・削除する作者診断。 */
export async function POST(request: Request): Promise<Response> {
  const { input } = await request.json();${logic}
  return Response.json(state);
}
`;
}

try {
  for (const [port, hostname] of [
    [4173, 'web'],
    [4175, 'preview'],
  ]) {
    const server = await step(
      'bridge-create',
      () => bridge(port, hostname, { observeCookie: true }),
      5000,
    );
    const sockets = new Set();
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    bridges.push({ server, sockets });
  }
  browser = await step('browser-launch', () =>
    chromium.launch({ headless: true, args: ['--no-sandbox'], timeout: 30000 }),
  );
  context = await step('browser-context', () => browser.newContext(), 5000);
  if (readerObserverEnabled) await context.addInitScript(installActionReaderObservation);
  const cdpObserverEnabled = !limitedReproduction && process.env.TSUMUCODE_COOKIE_CDP !== '0';
  transportObserver = await installChromiumObserver(context, { enabled: cdpObserverEnabled });
  // Cookie工程自身の実行版と上限を記録する。他工程の版を流用しない。
  console.log(
    JSON.stringify({
      event: 'main-cookie-transport',
      boundary: 'scope',
      cdpObserverEnabled,
      readerObserverEnabled,
      browserVersion: browser.version(),
      playwrightVersion: JSON.parse(
        await readFile('node_modules/playwright-core/package.json', 'utf8'),
      ).version,
      nodeVersion: process.version,
      architecture: process.arch,
      memoryMax: (await readFile('/sys/fs/cgroup/memory.max', 'utf8')).trim(),
      grade: limitedReproduction ? 'excluded-diagnostic-only' : 'included-canonical',
      plannedOperations: limitedReproduction ? 47 : 22,
      faultInjection: false,
      forcedGc: false,
      fetchReplacement: false,
      delaysAdded: false,
    }),
  );
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(15000);
  context.on('page', (page) => {
    page.on('framenavigated', (frame) => {
      navigationCounts.set(frame, (navigationCounts.get(frame) ?? 0) + 1);
    });
    page.on('requestfailed', () => browserEvents.requestFailed++);
    page.on('pageerror', () => browserEvents.pageError++);
  });
  manager = await step('manager-page', () => context.newPage(), 5000);
  await step(
    'manager-goto',
    () => manager.goto('http://127.0.0.1:4173/', { timeout: 15000 }),
    15000,
  );
  token = (await api('/api/session')).token;
  await step(
    'management-fixture',
    () =>
      context.addCookies([
        { name: 'management-fixture', value: 'unchanged', url: 'http://127.0.0.1:4173' },
      ]),
    5000,
  );
  for (const workspaceId of limitedReproduction
    ? [ACTION_WORKSPACE]
    : [FORM_WORKSPACE, ACTION_WORKSPACE]) {
    workspace = workspaceId === FORM_WORKSPACE ? 'form' : 'action';
    const lesson = workspaceId.slice(0, -4);
    const directory = `content/next/chapters/next-ch04/lessons/${lesson}/exercises/${workspaceId}`;
    const exercise = parse(await readFile(`${directory}/exercise.yaml`, 'utf8'));
    const files = {};
    for (const file of exercise.files)
      files[file.path] = await readFile(`${directory}/solution/${file.path}`, 'utf8');
    const solution = { ...files };
    const server = workspaceId === FORM_WORKSPACE ? 'app/api/note/route.ts' : 'app/actions.ts';
    const path = `/api/workspaces/${workspaceId}`;
    if (limitedReproduction) {
      // 新しい診断stackだけをCAS 0で初期化する。既存Sourceがあれば409で止める。
      await api(`${path}/source`, { expectedSourceRevision: 0, files: solution });
    }
    const original = await api(path);
    assert.ok(
      !['starting', 'ready', 'applying'].includes(original.lastRun?.state),
      '検証は非実行workspaceに限る',
    );
    files[server] = serverFixture(workspaceId === ACTION_WORKSPACE);
    let saved = await api(`${path}/source`, {
      expectedSourceRevision: original.sourceRevision,
      files,
    });
    saved = await start(workspaceId, saved.sourceRevision);
    const origin = previewOrigin(active.runId);
    const url = origin + previewBase(workspaceId, active.runId);
    // 許可Cookieの成功用注入ではなく、他名CookieがServerへ届かないことを検証する攻撃入力。
    await step(
      'unrelated-fixture',
      () =>
        context.addCookies([
          {
            name: 'unrelated-fixture',
            value: 'blocked',
            domain: `${active.runId}.localhost`,
            path: '/',
          },
        ]),
      5000,
    );
    const embedded = await mountEmbedded(url);
    await submit(embedded, 'dark', 'absent');
    const embeddedRead = await submit(embedded, 'read');
    assert.ok(['theme:dark', 'theme:absent'].includes(embeddedRead));
    let surface = embedded;
    let tab;
    progress('surface-selection', 'started');
    if (embeddedRead === 'theme:absent') {
      passed.push(`${workspaceId}: 埋込みでStrict Cookie保存/送信不可を実観測`);
      tab = await step('new-page', () => context.newPage(), 5000);
      await step('goto', () => tab.goto(url, { timeout: 15000 }), 15000);
      await step(
        'network-idle',
        () => tab.waitForLoadState('networkidle', { timeout: 15000 }),
        15000,
      );
      surface = tab;
    } else passed.push(`${workspaceId}: 埋込みで実Cookie読取`);
    progress('surface-selection', 'completed');
    const responses = [];
    const requests = [];
    const collect = (response) => {
      if (response.url().startsWith(origin) && response.request().method() === 'POST') {
        const responseHeaders = withCookieDeadline(
          () => response.allHeaders(),
          5000,
          'response-cookie-headers',
        ).then((headers) => headers['set-cookie']);
        const requestHeaders = withCookieDeadline(
          () => response.request().allHeaders(),
          5000,
          'request-cookie-headers',
        ).then((headers) => headers.cookie);
        // callback内の失敗を未処理にせず、後のPromise.allで必ず検査する。
        void responseHeaders.catch(() => {});
        void requestHeaders.catch(() => {});
        responses.push(responseHeaders);
        requests.push(requestHeaders);
      }
    };
    context.on('response', collect);
    await submit(surface, 'light');
    await submit(surface, 'read', 'light');
    let cookie = (await step('cookie-read', () => context.cookies(url), 5000)).find(
      ({ name }) => name === 'lesson-theme',
    );
    assert.ok(cookie);
    assert.equal(cookie.domain, `${active.runId}.localhost`);
    assert.equal(cookie.path, previewBase(workspaceId, active.runId).slice(0, -1));
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Strict');
    assert.equal(
      await step(
        'http-only-check',
        () =>
          surface
            .locator('body')
            .evaluate(() => globalThis.document.cookie.includes('lesson-theme=')),
        5000,
      ),
      false,
    );
    await submit(surface, 'dark', 'light');
    await submit(surface, 'read', 'dark');
    // 同runのSource反映はCookieの寿命を変えない。run分離と版ごとの初期化を混同しない。
    files[server] += '\n// 同runの版更新を確認する。\n';
    saved = await api(`${path}/source`, { expectedSourceRevision: saved.sourceRevision, files });
    const applying = saved;
    saved = await api(`${path}/apply`, {
      runId: active.runId,
      expectedSourceRevision: applying.sourceRevision,
      expectedSourceHash: applying.sourceHash,
    });
    assert.equal(saved.lastRun.runId, active.runId);
    assert.equal(saved.lastRun.sourceRevision, applying.sourceRevision);
    assert.equal(saved.lastRun.sourceHash, applying.sourceHash);
    // apply完了とHMR完了は別。選択済みsurfaceで新文書を開き、Cookie保持を検証する。
    if (tab) {
      await step('goto-after-apply', () => tab.goto(url, { timeout: 15000 }), 15000);
      await step(
        'network-idle',
        () => tab.waitForLoadState('networkidle', { timeout: 15000 }),
        15000,
      );
    } else surface = await mountEmbedded(url);
    await submit(surface, 'read-after-apply', 'dark');
    await submit(surface, 'clear', 'dark');
    await submit(surface, 'read', 'absent');
    cookie = (await step('cookie-read', () => context.cookies(url), 5000)).find(
      ({ name }) => name === 'lesson-theme',
    );
    assert.equal(cookie, undefined);
    if (limitedReproduction) {
      // 6組を上限とし、成功/失敗を理由に回数を延長しない。
      for (let cycle = 0; cycle < 6; cycle++) {
        await submit(surface, 'light', 'absent');
        await submit(surface, 'read', 'light');
        await submit(surface, 'dark', 'light');
        await submit(surface, 'read', 'dark');
        await submit(surface, 'clear', 'dark');
        await submit(surface, 'read', 'absent');
      }
    }
    const cookieHeaders = await Promise.all(responses);
    assert.ok(cookieHeaders.some((value) => value?.includes('lesson-theme=light;')));
    assert.ok(cookieHeaders.some((value) => value?.includes('Max-Age=0')));
    const cookieRequests = await Promise.all(requests);
    assert.ok(cookieRequests.some((value) => value?.includes('unrelated-fixture=blocked')));
    assert.ok(cookieRequests.some((value) => value?.includes('lesson-theme=light')));
    await submit(surface, 'dark', 'absent');
    await step(
      'parent-domain-check',
      () =>
        surface.locator('body').evaluate(() => {
          globalThis.document.cookie = 'lesson-theme=light; Domain=localhost; Path=/';
        }),
      5000,
    );
    assert.equal(
      (await step('cookie-read', () => context.cookies(url), 5000)).some(
        ({ name, domain }) =>
          name === 'lesson-theme' && ['localhost', '.localhost'].includes(domain),
      ),
      false,
    );
    const oldRun = active.runId;
    await api(`${path}/stop`, { runId: oldRun });
    active = undefined;
    saved = await start(workspaceId, saved.sourceRevision);
    assert.notEqual(active.runId, oldRun);
    const fresh = await step('new-page', () => context.newPage(), 5000);
    await step(
      'fresh-goto',
      () =>
        fresh.goto(previewOrigin(active.runId) + previewBase(workspaceId, active.runId), {
          timeout: 15000,
        }),
      15000,
    );
    await step(
      'network-idle',
      () => fresh.waitForLoadState('networkidle', { timeout: 15000 }),
      15000,
    );
    await submit(fresh, 'read', 'absent');
    await step('fresh-close', () => fresh.close(), 5000);
    if (!limitedReproduction) {
      // 採点Browserが自分で書いたCookieも、共有policyの既定拒否でServerへ渡さない。
      const client = 'app/note-form.tsx';
      const inputAnchor = "const [input, setInput] = useState('');";
      assert.equal(solution[client].split(inputAnchor).length, 2, '両教材の一意な入力stateを使う');
      assert.equal(
        solution[client].split('disabled={pending}').length,
        3,
        '入力と送信を両方保護する',
      );
      assert.equal(solution[server].split('const raw =').length, 2, 'Server検査を確実に挿入する');
      const gradeFiles = {
        ...solution,
        [client]: solution[client]
          .replace('import {', 'import { useEffect,')
          .replace(
            inputAnchor,
            `${inputAnchor}
  const [cookieReady, setCookieReady] = useState(false);
  useEffect(() => {
    document.cookie = 'lesson-theme=dark; Path=/';
    setCookieReady(document.cookie.split('; ').includes('lesson-theme=dark'));
  }, []);`,
          )
          .replaceAll('disabled={pending}', 'disabled={pending || !cookieReady}'),
        [server]:
          solution[server].replace(
            'const raw =',
            `if ((await cookies()).has('lesson-theme')) throw new Error('Grader Cookie boundary');
  const raw =`,
          ) + "\nimport { cookies } from 'next/headers';\n",
      };
      assert.ok(gradeFiles[client].includes("document.cookie = 'lesson-theme=dark; Path=/';"));
      assert.ok(
        gradeFiles[client].includes(
          "setCookieReady(document.cookie.split('; ').includes('lesson-theme=dark'))",
        ),
      );
      assert.equal(gradeFiles[client].split('disabled={pending || !cookieReady}').length, 3);
      saved = await api(`${path}/source`, {
        expectedSourceRevision: saved.sourceRevision,
        files: gradeFiles,
      });
      saved = await api(`${path}/apply`, {
        runId: active.runId,
        expectedSourceRevision: saved.sourceRevision,
        expectedSourceHash: saved.sourceHash,
      });
      const graded = await api(`${path}/grade`, {
        runId: active.runId,
        expectedSourceRevision: saved.sourceRevision,
        expectedSourceHash: saved.sourceHash,
      });
      assert.equal(
        graded.status,
        'pass',
        '採点内で自己設定したCookieをServerへ渡さず既存条件を判定する',
      );
    }
    if (tab) await step('tab-close', () => tab.close(), 5000);
    await step(
      'embedded-remove',
      () => manager.locator('iframe[title="Cookie境界の実Next"]').evaluate((node) => node.remove()),
      5000,
    );
    await api(`${path}/stop`, { runId: active.runId });
    active = undefined;
    context.off('response', collect);
    await Promise.all(responses);
    await Promise.all(requests);
    if (original.files)
      await api(`${path}/source`, {
        expectedSourceRevision: saved.sourceRevision,
        files: original.files,
      });
    passed.push(
      `${workspaceId}: 実set/read/delete・有限転送・HttpOnly/Strict/host/Path・同run反映保持・新run分離`,
    );
    passed.push(
      limitedReproduction
        ? `${workspaceId}: 限定再現のみ・採点は対象外`
        : `${workspaceId}: 採点BrowserのCookie自己設定を上流へ渡さない`,
    );
  }
  const management = (
    await step('management-read', () => context.cookies('http://127.0.0.1:4173'), 5000)
  ).find(({ name }) => name === 'management-fixture');
  assert.equal(management?.value, 'unchanged');
  console.log(JSON.stringify({ passed }));
} catch (error) {
  failure = error;
  progress(currentStage, 'failed');
} finally {
  const cleanupFailures = await cleanupCookieAcceptance({
    stop: active ? () => api(`${active.path}/stop`, { runId: active.runId }) : undefined,
    context,
    browser,
    bridges,
    onStage: progress,
  });
  if (failure || cleanupFailures.length > 0) {
    console.error(
      JSON.stringify({
        event: 'cookie-acceptance',
        outcome: 'failed',
        initialFailure: Boolean(failure),
        initialCategory: failure?.name,
        cleanupFailures,
      }),
    );
    process.exitCode = 1;
  } else progress(limitedReproduction ? 'limited-reproduction' : 'acceptance', 'completed');
}
