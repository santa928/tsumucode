import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { parse } from 'yaml';
import { bridge } from './browser-test-bridge.mjs';
import { previewOrigin, previewBase } from './preview-contract.mjs';
import { FORM_WORKSPACE, ACTION_WORKSPACE } from './next-form-preview.mjs';

// 作者/CI専用。Cookie jarやfetchを模擬せず、実NextのServerコードとBrowserの送信で検証する。
const bridges = [await bridge(4173, 'web'), await bridge(4175, 'preview')];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext();
const manager = await context.newPage();
const passed = [];
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

/** readonlyのClientフォームから実POSTし、次の要求がServerで読んだCookieを可視結果で確認する。 */
async function submit(frame, input, expected) {
  const field = frame.getByLabel('メモ', { exact: true });
  await expect(field).toBeEnabled();
  await field.fill(input);
  const reply = context.waitForEvent('response', {
    predicate: (response) =>
      response.request().method() === 'POST' && response.url().includes(`/w/`),
    timeout: 15000,
  });
  await frame.getByRole('button', { name: '保存する', exact: true }).press('Enter');
  const response = await reply;
  assert.equal(response.status(), 200);
  assert.equal(await response.finished(), null);
  await expect(frame.locator('#note-result')).toHaveAttribute('data-state', 'saved');
  const result = frame.locator('#note-result');
  if (expected !== undefined) await expect(result).toHaveText(`theme:${expected}`);
  return result.textContent();
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
    await manager.evaluate((src) => {
      const frame = globalThis.document.createElement('iframe');
      frame.title = 'Cookie境界の実Next';
      frame.sandbox = 'allow-scripts allow-same-origin allow-forms';
      frame.src = src;
      globalThis.document.body.append(frame);
    }, url);
    const frame = manager.frameLocator('iframe[title="Cookie境界の実Next"]');
    await frame.locator('#note').waitFor();
    // Hydration前のnative submitと混同しない。
    const embedded = manager.frames().find((candidate) => candidate.url() === url);
    assert.ok(embedded);
    await embedded.waitForLoadState('networkidle');
    await submit(frame, 'dark', 'absent');
    const embeddedRead = await submit(frame, 'read');
    assert.ok(['theme:dark', 'theme:absent'].includes(embeddedRead));
    let surface = frame;
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
    saved = await api(`${path}/apply`, {
      runId: active.runId,
      expectedSourceRevision: saved.sourceRevision,
      expectedSourceHash: saved.sourceHash,
    });
    await submit(surface, 'read', 'dark');
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
