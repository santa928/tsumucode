import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parse } from 'yaml';
import { unzipSync, strFromU8 } from 'fflate';
import { bridge } from './browser-test-bridge.mjs';
import { nextWorkspace } from './next-project-protocol.mjs';
import { ORIGIN } from './protocol.mjs';

// 作者/CI専用。通常の制作Lessonから工程別Progressと実Source持ち出しを確認する。
const directory = process.env.TSUMUCODE_NEXT_EVIDENCE ?? '.release-issue136';
await mkdir(directory, { recursive: true });
const bridges = [await bridge(4173, 'web'), await bridge(4175, 'preview')];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const observations = [];
const expectedSources = new Map();
const packaging = JSON.parse(await readFile('scripts/local/next-portable-packaging.json', 'utf8'));
const lessons = ['next-ch05-l01', 'next-ch06-l01'];
const status = () => page.getByText(/^実行状態:/u);
const preview = () => page.frameLocator('iframe[title="Next.jsの実サーバーPreview"]');

async function edit(path, source) {
  await page.getByRole('tab', { name: path, exact: true }).click();
  const editor = page.getByRole('textbox', { name: `${path} のコードエディター`, exact: true });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
}

async function apply() {
  await page.getByRole('button', { name: '保存して実行へ反映', exact: true }).click();
  await expect(status()).toContainText('実行可能', { timeout: 25000 });
}

/** UIの3行を個別に確認し、総合表示だけを工程の達成証拠にしない。 */
async function grade(checks) {
  await page.getByTestId('learning-stage').focus();
  await expect(
    page.getByText('編集権を再確認しています。保存を伴う操作は確認後に再開します。', {
      exact: true,
    }),
  ).toBeHidden();
  const button = page.getByRole('button', { name: '実サーバーで判定', exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const complete = checks.every(Boolean);
  await expect(
    page.getByRole('heading', {
      name: `判定結果: ${complete ? '合格' : '未達成'}`,
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  const rows = page.locator('#local-project-result').locator('..').getByRole('listitem');
  await expect(rows).toHaveCount(3);
  for (let index = 0; index < checks.length; index++)
    await expect(rows.nth(index).locator('p').first()).toHaveText(
      checks[index] ? /^達成:/u : /^未達成:/u,
    );
  await expect(page.getByRole('link', { name: '完了を確認する', exact: true })).toHaveCount(
    complete ? 1 : 0,
  );
}

async function stop() {
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(status()).toContainText('停止済み');
  await expect(page.getByTitle('Next.jsの実サーバーPreview')).toHaveCount(0);
}

/** 専用作者stackの前回Sourceを初期化する。成功結果や解答は注入しない。 */
async function prepare(workspace, files) {
  const session = await context.request.post(ORIGIN + '/api/session', {
    headers: { origin: ORIGIN },
    data: {},
  });
  assert.equal(session.status(), 200);
  const { token } = await session.json();
  const api = async (suffix, data = {}) => {
    const reply = await context.request.post(ORIGIN + `/api/workspaces/${workspace}` + suffix, {
      headers: { origin: ORIGIN, 'x-tsumucode-token': token },
      data,
    });
    assert.equal(reply.status(), 200);
    return reply.json();
  };
  const saved = await api('');
  if (['starting', 'ready', 'applying'].includes(saved.lastRun?.state))
    await api('/stop', { runId: saved.lastRun.runId });
  await api('/source', { expectedSourceRevision: saved.sourceRevision ?? 0, files });
}

/** 実Downloadを展開し、固定Source/包装以外のファイルを含まないことを確認する。 */
async function exportSource(workspace, files, suffix) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '制作Sourceを持ち出す', exact: true }).click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), `tsumucode-${workspace}.zip`);
  const path = `${directory}/${workspace}-${suffix}.zip`;
  await download.saveAs(path);
  const archive = unzipSync(new Uint8Array(await readFile(path)));
  const expected = { ...files, ...packaging };
  assert.deepEqual(Object.keys(archive).sort(), Object.keys(expected).sort());
  for (const [name, source] of Object.entries(expected))
    assert.equal(strFromU8(archive[name]), source, name);
  await expect(
    page.getByText('ZIPを作成しました。保存先はブラウザで確認してください。'),
  ).toBeVisible();
}

try {
  for (const lesson of lessons) {
    const workspace = `${lesson}-e01`;
    const capstone = lesson === 'next-ch06-l01';
    const chapter = lesson.slice(0, -4);
    const root = `content/next/chapters/${chapter}/lessons/${lesson}/exercises/${workspace}`;
    const exercise = parse(await readFile(`${root}/exercise.yaml`, 'utf8'));
    const contract = nextWorkspace(workspace);
    await prepare(workspace, contract.files);
    const writable = exercise.files.filter(({ editable }) => editable);
    const solution = {};
    for (const file of exercise.files)
      solution[file.path] = await readFile(`${root}/solution/${file.path}`, 'utf8');
    expectedSources.set(workspace, solution);
    const fixtureFiles = async (id) => {
      const fixture = exercise.fixtures.find((item) => item.id === id);
      assert.ok(fixture, id);
      const files = {};
      for (const file of fixture.files)
        files[file.path] = await readFile(`${root}/${file.source}`, 'utf8');
      return files;
    };
    const useFiles = async (files) => {
      for (const file of writable) await edit(file.path, files[file.path]);
      await expect(
        page.getByRole('button', { name: '実サーバーで判定', exact: true }),
      ).toBeDisabled();
      await apply();
    };

    await page.goto(`http://127.0.0.1:4173/#/courses/next/lessons/${lesson}/slides/${lesson}-g01`);
    for (let index = 1; index <= 3; index++) {
      await expect(page.getByTestId('slide-stage')).toHaveAttribute(
        'data-slide-id',
        `${lesson}-g0${index}`,
      );
      const prediction = page.getByRole('region', { name: '結果を予測する', exact: true });
      await prediction.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(prediction.locator('details')).toHaveAttribute('open', '');
      await page.keyboard.press('Enter');
      if (index < 3)
        await page.getByRole('link', { name: '次のスライドへ →', exact: true }).click();
    }
    await page.getByRole('link', { name: /のコード演習を始める/u }).click();
    await expect(
      page.getByRole('heading', { name: exercise.title, level: 1, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
    await page.getByRole('button', { name: '保存して起動', exact: true }).click();
    await expect(status()).toContainText('実行可能', { timeout: 25000 });
    await grade([false, false, false]);
    await useFiles(await fixtureFiles('structure-only'));
    await grade([true, false, false]);
    await useFiles(solution);
    await grade([true, true, true]);

    // 後工程の修正で旧達成を現在の達成へ流用せず、回復後に再度確認する。
    await useFiles(await fixtureFiles('later-break'));
    await grade([false, true, true]);
    await useFiles(solution);
    await grade([true, true, true]);

    const section = capstone ? 'events' : 'trips';
    const ids = capstone ? ['morning', 'evening'] : ['forest', 'sea'];
    const names = capstone ? ['朝の読書会', '夕方の読書会'] : ['森の散歩', '海の資料館'];
    const values = capstone ? ['open', 'full'] : ['outdoor', 'indoor'];
    const key = capstone ? 'availability' : 'area';
    const title = capstone ? '読書会の案内' : '小さな旅の案内';
    const handle = await page.getByTitle('Next.jsの実サーバーPreview').elementHandle();
    assert.ok(handle);
    const frame = await handle.contentFrame();
    assert.ok(frame);
    const base = new URL(frame.url()).pathname;
    assert.ok(base.endsWith('/'));
    assert.equal(await frame.title(), title);
    await expect(preview().locator('meta[name="description"]')).toHaveAttribute(
      'content',
      new RegExp(title),
    );
    await expect(preview().locator('main img')).toHaveAttribute('width', '320');
    await expect(preview().locator('main img')).toHaveAttribute('height', '160');
    assert.equal(
      await preview()
        .locator('main img')
        .evaluate((image) => image.complete && image.naturalWidth === 320),
      true,
    );

    // 親selectから、共通navの入口・一覧・本文の順に実Tabで移動する。
    await page.getByLabel('表示する応答').focus();
    for (const name of ['入口', '一覧', '一覧を開く']) {
      await page.keyboard.press('Tab');
      await expect(preview().getByRole('link', { name, exact: true })).toBeFocused();
    }
    await page.keyboard.press('Enter');
    await expect(preview().locator('h1#message')).toHaveText(capstone ? '読書会一覧' : '旅の一覧');
    for (let index = 0; index < ids.length; index++) {
      const response = page.waitForResponse(
        (reply) =>
          reply.frame() === frame &&
          reply.request().isNavigationRequest() &&
          new URL(reply.url()).pathname === base + section + '/' + ids[index],
      );
      await preview().getByRole('link', { name: names[index], exact: true }).focus();
      await page.keyboard.press('Enter');
      const reply = await response;
      assert.equal(reply.status(), 200);
      assert.equal(await reply.finished(), null);
      await expect(preview().locator('h1#message')).toHaveText(names[index]);
      await expect(preview().locator(capstone ? '#booking-state' : '#area')).toHaveText(
        capstone ? (index === 0 ? '受付中' : '受付終了') : index === 0 ? '屋外' : '室内',
      );
      await preview().getByRole('link', { name: '一覧へ戻る', exact: true }).focus();
      await page.keyboard.press('Enter');
    }
    for (let index = 0; index < values.length; index++) {
      const select = preview().getByLabel(capstone ? '受付状況' : '過ごす場所', { exact: true });
      await select.focus();
      await page.keyboard.press('Home');
      for (let next = 0; next <= index; next++) await page.keyboard.press('ArrowDown');
      await expect(select).toHaveValue(values[index]);
      await page.keyboard.press('Tab');
      await expect(preview().getByRole('button', { name: '絞り込む', exact: true })).toBeFocused();
      const response = page.waitForResponse(
        (reply) =>
          reply.frame() === frame &&
          reply.request().isNavigationRequest() &&
          reply.request().method() === 'GET' &&
          new URL(reply.url()).search === `?${key}=${values[index]}`,
      );
      await page.keyboard.press('Enter');
      const reply = await response;
      assert.equal(reply.status(), 200);
      assert.equal(await reply.finished(), null);
      await expect(preview().locator('main li')).toHaveCount(1);
      await expect(preview().getByRole('link', { name: names[index], exact: true })).toBeVisible();
      if (index === 0) {
        await page.getByLabel('表示する応答').selectOption(section);
        await expect(preview().locator('main li')).toHaveCount(2);
      }
    }
    await page.getByLabel('表示する応答').selectOption(`${section}?${key}=unknown`);
    await expect(preview().locator('main [role="alert"]')).toHaveText('選択を確認してください。');
    await preview().getByRole('link', { name: '一覧へ戻る', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(preview().locator('main li')).toHaveCount(2);
    await page.getByLabel('表示する応答').selectOption('');
    await expect(preview().locator('h1#message')).toHaveText(title);
    await handle.dispose();

    if (!capstone) {
      const hint = page.locator('section[aria-label="工程票"] > details');
      await hint.locator(':scope > summary').focus();
      await page.keyboard.press('Enter');
      await hint.locator('details').first().locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(hint.locator('details').first()).toHaveAttribute('open', '');
    }
    await exportSource(workspace, solution, 'solution');
    // 未反映の編集もクリック時点のZIPへ入り、Source保存版と旧判定へ書き戻さない。
    const marked = {
      ...solution,
      'app/page.tsx': solution['app/page.tsx'] + '\n// 持ち出し時点の下書き\n',
    };
    const revision = (await page.getByText(/端末の下書き:/u).textContent()).match(
      /Source保存版: (\d+)/u,
    )[1];
    await edit('app/page.tsx', marked['app/page.tsx']);
    await exportSource(workspace, marked, 'unsaved');
    await expect(page.getByText(/端末の下書き:/u)).toContainText(`Source保存版: ${revision}`);
    await expect(page.getByRole('link', { name: '完了を確認する', exact: true })).toHaveCount(0);
    await edit('app/page.tsx', solution['app/page.tsx']);
    await apply();
    await grade([true, true, true]);

    const accessibility = await new AxeBuilder({ page }).analyze();
    assert.equal(accessibility.violations.length, 0, JSON.stringify(accessibility.violations));
    await page.screenshot({ path: `${directory}/${workspace}-desktop.png`, fullPage: true });
    await stop();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('コード編集はPCから利用できます', { exact: true })).toBeVisible();
    await expect(page.getByTitle('Next.jsの実サーバーPreview')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '実サーバーで判定', exact: true })).toHaveCount(
      0,
    );
    assert.equal(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth > globalThis.window.innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: `${directory}/${workspace}-narrow.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.reload();
    await expect(page.getByText('この下書きの合格記録があります。')).toBeVisible();
    await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
    await page.getByRole('button', { name: '保存して起動', exact: true }).click();
    await expect(status()).toContainText('実行可能', { timeout: 25000 });
    await expect(preview().locator('h1#message')).toHaveText(title);
    await grade([true, true, true]);
    await stop();
    observations.push({
      workspace,
      sourceFiles: Object.keys(contract.files).length,
      stages: 3,
      zip: 'solution/未反映下書きともSource・包装完全一致',
      keyboard: 'Tab/Enter/GET2条件/不正値回復',
      axe: 0,
      narrowOverflow: 0,
    });
  }

  await page.getByRole('link', { name: '学習一覧へ戻る', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const download = await downloaded;
  const jsonPath = `${directory}/next-production-progress.json`;
  await download.saveAs(jsonPath);
  const raw = await readFile(jsonPath, 'utf8');
  const bundle = JSON.parse(raw);
  assert.equal(raw.includes('x-tsumucode-token'), false);
  assert.equal(raw.includes('"runId"'), false);
  for (const lesson of lessons) {
    const workspace = `${lesson}-e01`;
    const draft = bundle.drafts[`next:${workspace}`];
    assert.equal(draft.workspaceId, workspace);
    assert.deepEqual(draft.files, expectedSources.get(workspace));
    assert.equal(bundle.courses.next.lessons[lesson].currentComplete, true);
    assert.equal(
      draft.validationHistory[0].checks.every((check) => !check.passed),
      true,
    );
    assert.ok(
      draft.validationHistory.some(
        (entry) => entry.checks.map((check) => check.passed).join(',') === 'true,false,false',
      ),
    );
    assert.ok(
      draft.validationHistory.some(
        (entry) => entry.checks.map((check) => check.passed).join(',') === 'false,true,true',
      ),
    );
    assert.equal(draft.validationHistory.at(-1).passedRequirementIds.length, 3);
    if (lesson === 'next-ch06-l01') assert.equal(draft.revealedHintIds.length, 0);
  }
  const imported = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  try {
    const importedPage = await imported.newPage();
    await importedPage.goto('http://127.0.0.1:4173/#/');
    await importedPage
      .getByLabel('書き出した学習データを読み込む', { exact: true })
      .setInputFiles(jsonPath);
    await expect(
      importedPage.getByRole('region', { name: '読み込み差分', exact: true }),
    ).toBeVisible();
    await importedPage.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
    await expect(
      importedPage.getByRole('region', { name: '読み込み差分', exact: true }),
    ).toHaveCount(0);
    for (const lesson of lessons) {
      await importedPage.goto(
        `http://127.0.0.1:4173/#/courses/next/lessons/${lesson}/exercises/${lesson}-e01`,
      );
      await expect(importedPage.getByText('この下書きの合格記録があります。')).toBeVisible();
    }
  } finally {
    await imported.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      observations,
      browser: browser.version(),
      pageErrors: errors,
      progress: '独立2WS/3工程/部分達成/後工程破損/再回復/JSON export-import',
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ observations, errors, status: await status().allTextContents() }));
  await page.screenshot({ path: `${directory}/next-production-ui-failure.png`, fullPage: true });
  throw error;
} finally {
  await page
    .getByRole('button', { name: '停止', exact: true })
    .click({ timeout: 3000 })
    .catch(() => {});
  await browser.close();
  bridges.forEach((server) => {
    server.closeAllConnections();
    server.close();
  });
}
