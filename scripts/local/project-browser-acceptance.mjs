import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { bridge } from './browser-test-bridge.mjs';

// 作者/CI専用。fixtureの採点を使わず、製品画面から編集・実HTTP・採点・保存を通す。
const bridges = [await bridge(4173, 'web'), await bridge(4175, 'preview')];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await context.newPage();
const passed = [];
const apiRequests = [];
page.on('request', (req) => {
  if (new URL(req.url()).pathname.startsWith('/api/'))
    apiRequests.push(new URL(req.url()).pathname);
});
await mkdir('.release-issue126', { recursive: true });
const path = 'http://127.0.0.1:4173/#/local/project';
const solution = "export const message = 'こんにちは、実サーバー！';\n";
const status = () => page.getByText(/^実行状態:/u);
const editor = () =>
  page.getByRole('textbox', { name: 'message.js のコードエディター', exact: true });
async function edit(text) {
  await page.getByRole('tab', { name: 'message.js', exact: true }).click();
  await editor().click();
  await editor().press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(editor()).toContainText(text.trim());
}
async function ready() {
  await expect(status()).toContainText('実行可能', { timeout: 30000 });
}
async function apply() {
  await page.getByRole('button', { name: '保存して実行へ反映', exact: true }).click();
  await expect(page.getByRole('button', { name: '実サーバーで判定', exact: true })).toBeEnabled({
    timeout: 30000,
  });
}
async function grade(expected) {
  await page.getByRole('button', { name: '実サーバーで判定', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `判定結果: ${expected}`, exact: true }),
  ).toBeVisible({ timeout: 20000 });
}
async function stop() {
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(status()).toContainText('停止済み', { timeout: 30000 });
}
async function delayedGrade() {
  let entered;
  let release;
  let fulfilled;
  const responseReady = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const handled = new Promise((resolve) => {
    fulfilled = resolve;
  });
  await page.route('**/api/workspaces/*/grade', async (route) => {
    const reply = await route.fetch();
    assert.equal(reply.status(), 200);
    entered();
    await gate;
    try {
      await route.fulfill({ response: reply });
    } finally {
      fulfilled();
    }
  });
  await page.getByRole('button', { name: '実サーバーで判定', exact: true }).click();
  await responseReady;
  return async () => {
    release();
    await handled;
    await page.unroute('**/api/workspaces/*/grade');
  };
}
try {
  await page.goto(path);
  await expect(
    page.getByRole('heading', { name: '実サーバーで見出しを変更する', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '環境へ接続', exact: true })).toBeEnabled();
  assert.deepEqual(apiRequests, []);
  await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
  await expect(editor()).toBeVisible();
  if (await page.getByRole('button', { name: '停止', exact: true }).isEnabled()) await stop();
  await edit("export const message = 'こんにちは、Workspace！';\n");
  await page.getByRole('button', { name: '保存して起動', exact: true }).click();
  await ready();
  await expect(
    page
      .frameLocator('iframe[title="Local Vite Projectの実サーバーPreview"]')
      .locator('h1#message'),
  ).toHaveText('こんにちは、Workspace！');
  await grade('未達成');
  passed.push('明示接続・製品編集/保存/起動・実HTTP Preview・初期不合格');
  await edit(solution);
  await expect(page.getByRole('button', { name: '実サーバーで判定', exact: true })).toBeDisabled();
  await expect(
    page
      .frameLocator('iframe[title="Local Vite Projectの実サーバーPreview"]')
      .locator('h1#message'),
  ).toHaveText('こんにちは、Workspace！');
  await apply();
  await expect(
    page
      .frameLocator('iframe[title="Local Vite Projectの実サーバーPreview"]')
      .locator('h1#message'),
  ).toHaveText('こんにちは、実サーバー！');
  await grade('合格');
  await expect(page.getByText('この下書きの合格記録があります。', { exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('#main-content').analyze();
  await writeFile('.release-issue126/project-axe.json', JSON.stringify(axe.violations, null, 2));
  assert.deepEqual(
    axe.violations.map(({ id, impact }) => ({ id, impact })),
    [],
  );
  await page.screenshot({ path: '.release-issue126/project-pass.png', fullPage: true });
  passed.push('保存版/反映版・実HMR・製品採点合格・既存進捗・axe');
  await edit(
    "throw new Error('learner error'); export const message = 'こんにちは、実サーバー！';\n",
  );
  await apply();
  await grade('コードエラー');
  await expect(page.getByText('この下書きの合格記録があります。', { exact: true })).toHaveCount(0);
  await edit(solution);
  await apply();
  const releaseEdit = await delayedGrade();
  await edit("export const message = '連続編集';\n");
  await releaseEdit();
  await expect(page.getByText(/採点中に編集されたため/u)).toBeVisible();
  await expect(page.getByRole('heading', { name: '判定結果: 合格', exact: true })).toHaveCount(0);
  passed.push('実JSエラー・採点中の連続編集後着を合格にしない');
  await edit(solution);
  await apply();
  const releaseStop = await delayedGrade();
  await stop();
  await releaseStop();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '判定結果: 合格', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '保存して起動', exact: true }).click();
  await ready();
  const releaseMove = await delayedGrade();
  await page.getByRole('link', { name: '学習一覧へ戻る', exact: true }).click();
  await releaseMove();
  await expect(
    page.getByRole('heading', { name: '学びたいピースを選ぶ', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '実サーバーで見出しを変更する', exact: true }).click();
  await expect(editor()).toContainText('こんにちは、実サーバー！');
  await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
  await expect(status()).toContainText('停止済み', { timeout: 30000 });
  passed.push('採点中の停止・画面移動後の後着拒否・対象run回収・下書き再開');
  await page.route('**/api/workspaces/local-vite-heading', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'controller unavailable' }),
    }),
  );
  await page.getByRole('button', { name: '環境へ再接続', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('controller unavailable');
  await expect(editor()).toContainText('こんにちは、実サーバー！');
  await page.unroute('**/api/workspaces/local-vite-heading');
  await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
  await page.getByRole('button', { name: '保存して起動', exact: true }).click();
  await ready();
  await grade('合格');
  await page.reload();
  await expect(editor()).toContainText('こんにちは、実サーバー！');
  await expect(page.getByText('この下書きの合格記録があります。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
  await expect(status()).toContainText('停止済み', { timeout: 30000 });
  passed.push('controller通信失敗・明示再接続・再読込で下書き/進捗保持');
  await page.getByRole('tab', { name: 'message.js', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'styles.css', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'index.html', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(page.getByRole('button', { name: '保存して起動', exact: true })).toBeDisabled();
  await expect(page.getByText(/編集と実行には幅1024px以上/u)).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 960 });
  passed.push('キーボードtabs・小画面の編集/実行制限と案内');
  await page.getByRole('button', { name: '保存して起動', exact: true }).click();
  await ready();
  const nextTab = await context.newPage();
  await nextTab.goto(path);
  await expect(
    nextTab.getByRole('heading', { name: '別のタブで編集中です', exact: true }),
  ).toBeVisible();
  await nextTab.getByRole('button', { name: 'このタブで編集を引き継ぐ', exact: true }).click();
  await nextTab.getByRole('tab', { name: 'message.js', exact: true }).click();
  await expect(
    nextTab.getByRole('textbox', { name: 'message.js のコードエディター', exact: true }),
  ).toContainText('こんにちは、実サーバー！');
  await nextTab.getByRole('button', { name: '環境へ接続', exact: true }).click();
  await expect(nextTab.getByText(/^実行状態:/u)).toContainText('停止済み');
  await expect(page.getByText('このタブの編集は終了しました。', { exact: true })).toBeVisible();
  await nextTab.close();
  passed.push('別タブのreadonly・実Lease譲渡時に保存/停止完了・元タブの編集終了');
  await page.getByRole('link', { name: '学習一覧へ戻る', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const download = await downloaded;
  await download.saveAs('.release-issue126/project-progress.json');
  const raw = await readFile('.release-issue126/project-progress.json', 'utf8');
  const bundle = JSON.parse(raw);
  assert.equal(bundle.schemaVersion, 2);
  assert.equal(bundle.courses['local-vite-workspace'].currentComplete, true);
  assert.equal(
    bundle.drafts['local-vite-workspace:local-vite-heading'].files['message.js'],
    solution,
  );
  assert.equal(raw.includes('x-tsumucode-token'), false);
  const importedContext = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  try {
    const imported = await importedContext.newPage();
    await imported.goto('http://127.0.0.1:4173/#/');
    await imported
      .getByLabel('書き出した学習データを読み込む', { exact: true })
      .setInputFiles('.release-issue126/project-progress.json');
    await expect(imported.getByRole('region', { name: '読み込み差分', exact: true })).toContainText(
      'local-vite-workspace',
    );
    await imported.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
    await expect(imported.getByRole('region', { name: '読み込み差分', exact: true })).toHaveCount(
      0,
    );
    await imported.getByRole('link', { name: '実サーバーで見出しを変更する', exact: true }).click();
    await imported.getByRole('tab', { name: 'message.js', exact: true }).click();
    await expect(
      imported.getByRole('textbox', { name: 'message.js のコードエディター', exact: true }),
    ).toContainText('こんにちは、実サーバー！');
    await expect(
      imported.getByText('この下書きの合格記録があります。', { exact: true }),
    ).toBeVisible();
    await expect(imported.getByRole('button', { name: '環境へ接続', exact: true })).toBeEnabled();
  } finally {
    await importedContext.close();
  }
  passed.push('既存端末データJSONを別保存状態へexport/import・下書きと進捗保持');
  console.log(JSON.stringify({ passed, browser: browser.version() }, null, 2));
} catch (error) {
  await page.screenshot({ path: '.release-issue126/project-failure.png', fullPage: true });
  await writeFile(
    '.release-issue126/project-failure-aria.txt',
    await page.locator('body').ariaSnapshot(),
  );
  throw error;
} finally {
  await page.close();
  await context.close();
  await browser.close();
  bridges.forEach((server) => {
    server.closeAllConnections();
    server.close();
  });
}
