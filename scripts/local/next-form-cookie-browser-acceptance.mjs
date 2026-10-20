import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { parse } from 'yaml';
import { bridge } from './browser-test-bridge.mjs';
import { previewOrigin, previewBase } from './preview-contract.mjs';
import { FORM_WORKSPACE, ACTION_WORKSPACE } from './next-form-preview.mjs';
import { watchDocumentVersion } from './next-project-observations.mjs';

// 作者/CI専用。Cookie jarやfetchを模擬せず、実NextのServerコードとBrowserの送信で検証する。
const bridges = [await bridge(4173, 'web'), await bridge(4175, 'preview')];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext();
const navigationCounts = new WeakMap();
const documentVersions = new WeakMap();
const browserEvents = { requestFailed: 0, pageError: 0 };
context.on('page', (page) => {
  page.on('framenavigated', (frame) => {
    navigationCounts.set(frame, (navigationCounts.get(frame) ?? 0) + 1);
  });
  page.on('requestfailed', () => browserEvents.requestFailed++);
  page.on('pageerror', () => browserEvents.pageError++);
});
const manager = await context.newPage();
const passed = [];
let sequence = 0;
let token;
let active;

/** 管理APIだけに管理tokenを付ける。Preview操作にはこのAPIRequestContextを使わない。 */
async function api(path, value = {}) {
  const response = await context.request.post(`http://127.0.0.1:4173${path}`, {
    headers: { origin: 'http://127.0.0.1:4173', ...(token ? { 'x-tsumucode-token': token } : {}) },
    data: value,
    timeout: 30000,
  });
  assert.ok(response.ok(), `Cookie author API ${path}: ${response.status()}`);
  return response.json();
}

/** 自分の検証runだけを起動し、既存のready契約を待つ。 */
async function start(workspaceId, sourceRevision) {
  const path = `/api/workspaces/${workspaceId}`;
  const started = await api(`${path}/start`, { expectedSourceRevision: sourceRevision });
  active = { path, runId: started.runId };
  for (let attempt = 0; attempt < 100; attempt++) {
    const saved = await api(path);
    assert.equal(saved.lastRun.runId, active.runId);
    if (saved.lastRun.state === 'ready') return saved;
    assert.notEqual(saved.lastRun.state, 'failed', 'Cookie fixture run failed');
    await delay(200);
  }
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
  const marker = await documentMarker(frame, randomUUID());
  assert.equal(typeof marker, 'string');
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
  await expect(field).toBeEnabled();
  await field.fill(requestInput);
  const reply = context.waitForEvent('response', {
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
  try {
    await frame.getByRole('button', { name: '保存する', exact: true }).press('Enter');
    const response = await reply;
    snapshot.httpStatus = response.status();
    snapshot.completed = (await response.finished()) === null;
    snapshot.navigationRequest = response.request().isNavigationRequest();
    assert.equal(snapshot.httpStatus, 200);
    assert.equal(snapshot.completed, true);
    assert.equal(snapshot.navigationRequest, false);
    if (form) {
      const state = await response.json();
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
    await expect(result).toHaveAttribute('data-state', 'saved');
    if (expected !== undefined) await expect(result).toHaveText(`theme:${expected}`);
    await expect(field).toHaveValue(requestInput);
    await expect(field).toBeEnabled();
    assert.equal(frame.isDetached(), false);
    const text = await result.textContent();
    snapshot.documentMatches = (await documentMarker(frame)) === marker;
    snapshot.navigationEventsAfter = navigationCounts.get(frame) ?? 0;
    snapshot.documentVersionAfter = version();
    assert.equal(snapshot.documentMatches, true);
    assert.equal(snapshot.documentVersionAfter, snapshot.documentVersionBefore);
    assert.equal(frame.url(), actorUrl.href);
    console.log(JSON.stringify({ ...snapshot, outcome: 'saved' }));
    return text;
  } catch (error) {
    // Cookie・本文・URL・Sourceを出さず、文書置換と入力/結果の不一致だけ残す。
    snapshot.documentMatches = await documentMarker(frame).then(
      (value) => !frame.isDetached() && value === marker,
      () => false,
    );
    snapshot.navigationEventsAfter = navigationCounts.get(frame) ?? 0;
    snapshot.documentVersionAfter = version();
    snapshot.actorUrlMatches = frame.url() === actorUrl.href;
    snapshot.fieldMatches = await field.inputValue({ timeout: 1000 }).then(
      (value) => value === requestInput,
      () => false,
    );
    snapshot.domState = await frame
      .locator('#note-result')
      .getAttribute('data-state', {
        timeout: 1000,
      })
      .catch(() => 'unavailable');
    if (!['idle', 'saved', 'invalid', 'failed', 'unavailable'].includes(snapshot.domState))
      snapshot.domState = 'unexpected';
    console.log(JSON.stringify({ ...snapshot, browserEvents, outcome: 'failed' }));
    throw error;
  }
}

/** 通常UIと同じiframe設定で新文書を作る。CookieやBrowser contextは変更しない。 */
async function mountEmbedded(url) {
  await manager.locator('iframe[title="Cookie境界の実Next"]').evaluateAll((nodes) => {
    for (const node of nodes) node.remove();
  });
  await manager.evaluate((src) => {
    const frame = globalThis.document.createElement('iframe');
    frame.title = 'Cookie境界の実Next';
    frame.sandbox = 'allow-scripts allow-same-origin allow-forms';
    frame.src = src;
    globalThis.document.body.append(frame);
  }, url);
  await manager.frameLocator('iframe[title="Cookie境界の実Next"]').locator('#note').waitFor();
  const embedded = manager.frames().find((candidate) => candidate.url() === url);
  assert.ok(embedded);
  await embedded.waitForLoadState('networkidle');
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
  await manager.goto('http://127.0.0.1:4173/');
  token = (await api('/api/session')).token;
  await context.addCookies([
    { name: 'management-fixture', value: 'unchanged', url: 'http://127.0.0.1:4173' },
  ]);
  for (const workspaceId of [FORM_WORKSPACE, ACTION_WORKSPACE]) {
    const lesson = workspaceId.slice(0, -4);
    const directory = `content/next/chapters/next-ch04/lessons/${lesson}/exercises/${workspaceId}`;
    const exercise = parse(await readFile(`${directory}/exercise.yaml`, 'utf8'));
    const files = {};
    for (const file of exercise.files)
      files[file.path] = await readFile(`${directory}/solution/${file.path}`, 'utf8');
    const solution = { ...files };
    const server = workspaceId === FORM_WORKSPACE ? 'app/api/note/route.ts' : 'app/actions.ts';
    const path = `/api/workspaces/${workspaceId}`;
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
    await context.addCookies([
      {
        name: 'unrelated-fixture',
        value: 'blocked',
        domain: `${active.runId}.localhost`,
        path: '/',
      },
    ]);
    const embedded = await mountEmbedded(url);
    await submit(embedded, 'dark', 'absent');
    const embeddedRead = await submit(embedded, 'read');
    assert.ok(['theme:dark', 'theme:absent'].includes(embeddedRead));
    let surface = embedded;
    let tab;
    if (embeddedRead === 'theme:absent') {
      passed.push(`${workspaceId}: 埋込みでStrict Cookie保存/送信不可を実観測`);
      tab = await context.newPage();
      await tab.goto(url);
      await tab.waitForLoadState('networkidle');
      surface = tab;
    } else passed.push(`${workspaceId}: 埋込みで実Cookie読取`);
    const responses = [];
    const requests = [];
    const collect = (response) => {
      if (response.url().startsWith(origin) && response.request().method() === 'POST') {
        responses.push(response.allHeaders().then((headers) => headers['set-cookie']));
        requests.push(
          response
            .request()
            .allHeaders()
            .then((headers) => headers.cookie),
        );
      }
    };
    context.on('response', collect);
    await submit(surface, 'light');
    await submit(surface, 'read', 'light');
    let cookie = (await context.cookies(url)).find(({ name }) => name === 'lesson-theme');
    assert.ok(cookie);
    assert.equal(cookie.domain, `${active.runId}.localhost`);
    assert.equal(cookie.path, previewBase(workspaceId, active.runId).slice(0, -1));
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Strict');
    assert.equal(
      await surface
        .locator('body')
        .evaluate(() => globalThis.document.cookie.includes('lesson-theme=')),
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
      await tab.goto(url);
      await tab.waitForLoadState('networkidle');
    } else surface = await mountEmbedded(url);
    await submit(surface, 'read-after-apply', 'dark');
    await submit(surface, 'clear', 'dark');
    await submit(surface, 'read', 'absent');
    cookie = (await context.cookies(url)).find(({ name }) => name === 'lesson-theme');
    assert.equal(cookie, undefined);
    const cookieHeaders = await Promise.all(responses);
    assert.ok(cookieHeaders.some((value) => value?.includes('lesson-theme=light;')));
    assert.ok(cookieHeaders.some((value) => value?.includes('Max-Age=0')));
    const cookieRequests = await Promise.all(requests);
    assert.ok(cookieRequests.some((value) => value?.includes('unrelated-fixture=blocked')));
    assert.ok(cookieRequests.some((value) => value?.includes('lesson-theme=light')));
    await submit(surface, 'dark', 'absent');
    await surface.locator('body').evaluate(() => {
      globalThis.document.cookie = 'lesson-theme=light; Domain=localhost; Path=/';
    });
    assert.equal(
      (await context.cookies(url)).some(
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
    const fresh = await context.newPage();
    await fresh.goto(previewOrigin(active.runId) + previewBase(workspaceId, active.runId));
    await fresh.waitForLoadState('networkidle');
    await submit(fresh, 'read', 'absent');
    await fresh.close();
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
    await tab?.close();
    await manager.locator('iframe[title="Cookie境界の実Next"]').evaluate((node) => node.remove());
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
    passed.push(`${workspaceId}: 採点BrowserのCookie自己設定を上流へ渡さない`);
  }
  const management = (await context.cookies('http://127.0.0.1:4173')).find(
    ({ name }) => name === 'management-fixture',
  );
  assert.equal(management?.value, 'unchanged');
  console.log(JSON.stringify({ passed }));
} finally {
  if (active) await api(`${active.path}/stop`, { runId: active.runId });
  await context.close();
  await browser.close();
  for (const server of bridges) await new Promise((resolve) => server.close(resolve));
}
