import console from 'node:console';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { bridge } from './browser-test-bridge.mjs';

// 作者/CI専用。通常Lessonの実画面から編集・実page/HTTP・保存・判定・停止を通す。
const bridges = [await bridge(4173, 'web'), await bridge(4175, 'preview')];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await context.newPage();
const passed = [];
const errors = [];
const websockets = [];
const websocketFrames = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('websocket', (socket) => {
  websockets.push(socket.url());
  socket.on('framereceived', ({ payload }) => websocketFrames.push(String(payload)));
});
const directory = '.release-issue132';
await mkdir(directory, { recursive: true });
const status = () => page.getByText(/^実行状態:/u);

async function edit(path, source) {
  await page.getByRole('tab', { name: path, exact: true }).click();
  const editor = page.getByRole('textbox', { name: `${path} のコードエディター`, exact: true });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
}

async function stop() {
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(status()).toContainText('停止済み');
  await expect(page.getByTitle('Next.jsの実サーバーPreview')).toHaveCount(0);
}

try {
  await page.goto('http://127.0.0.1:4173/#/');
  await page.getByRole('link', { name: 'Next.jsの9教材を開く' }).click();
  await expect(
    page.getByRole('heading', { name: 'Next.js 実サーバーの第一歩', exact: true }),
  ).toBeVisible();
  await page.goto(
    'http://127.0.0.1:4173/#/courses/next/lessons/next-ch01-l01/slides/next-ch01-l01-s01',
  );
  for (let index = 0; index < 4; index += 1) {
    // URL更新後も前のSlideが残るため、表示中のSlide IDまで待つ。
    await expect(page.getByTestId('slide-stage')).toHaveAttribute(
      'data-slide-id',
      `${'next-ch01-l01'}-s0${index + 1}`,
    );
    const prediction = page.getByRole('region', { name: '結果を予測する', exact: true });
    await expect(prediction.locator('details')).not.toHaveAttribute('open', '');
    await prediction.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(prediction.locator('details')).toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await expect(prediction.locator('details')).not.toHaveAttribute('open', '');
    if (index < 3) await page.getByRole('link', { name: '次のスライドへ →', exact: true }).click();
  }
  await page.getByRole('link', { name: /のコード演習を始める/u }).click();
  await expect(
    page.getByRole('heading', { name: 'pageの見出しとquery別のJSONを変える', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'app/page.tsx', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存して起動', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '保存して起動', exact: true }).click();
  await expect(status()).toContainText('実行可能', { timeout: 25000 });
  const preview = () => page.frameLocator('iframe[title="Next.jsの実サーバーPreview"]');
  await expect(preview().locator('h1#message')).toHaveText('こんにちは、Starter！');
  await page.getByRole('button', { name: '実サーバーで判定' }).click();
  await expect(page.getByRole('heading', { name: '判定結果: 未達成', exact: true })).toBeVisible({
    timeout: 20000,
  });
  passed.push('通常Lessonの入口/初期Source/実page/未達成');

  const root =
    'content/next/chapters/next-ch01/lessons/next-ch01-l01/exercises/next-ch01-l01-e01/solution';
  const solutionPage = await readFile(`${root}/app/page.tsx`, 'utf8');
  const solutionRoute = await readFile(`${root}/app/api/question/route.ts`, 'utf8');
  await edit('app/page.tsx', solutionPage);
  await edit('app/api/question/route.ts', solutionRoute);
  await expect(page.getByRole('button', { name: '実サーバーで判定' })).toBeDisabled();
  await page.getByRole('button', { name: '保存して実行へ反映' }).click();
  await expect(status()).toContainText('実行可能', { timeout: 15000 });
  await expect(preview().locator('h1#message')).toHaveText('こんにちは、Next.js！');
  await page.getByLabel('表示する応答').selectOption('api/question');
  await expect(preview().locator('body')).toContainText('最初の実リクエスト');
  await page.getByLabel('表示する応答').selectOption('api/question?mode=second');
  await expect(preview().locator('body')).toContainText('2つ目の実リクエスト');
  await page.getByLabel('表示する応答').selectOption('');
  await page.getByRole('button', { name: '実サーバーで判定' }).click();
  await expect(page.getByRole('heading', { name: '判定結果: 合格', exact: true })).toBeVisible({
    timeout: 20000,
  });
  assert.ok(
    websockets.some((url) => url.includes('/_next/hmr?id=')),
    JSON.stringify(websockets),
  );
  assert.ok(websocketFrames.length > 0, 'HMR handshake後の実frameを観測する');
  passed.push('2ファイル編集/反映/実query別JSON/合格/HMR接続');

  const errorRoute = await readFile(
    `${root}/../fixtures/code-error/app/api/question/route.ts`,
    'utf8',
  );
  await edit('app/api/question/route.ts', errorRoute);
  await page.getByRole('button', { name: '保存して実行へ反映' }).click();
  await expect(status()).toContainText('実行可能', { timeout: 15000 });
  await page.getByRole('button', { name: '実サーバーで判定' }).click();
  await expect(
    page.getByRole('heading', { name: '判定結果: コードエラー', exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await edit('app/api/question/route.ts', solutionRoute);
  await page.getByRole('button', { name: '保存して実行へ反映' }).click();
  await expect(status()).toContainText('実行可能', { timeout: 15000 });
  await page.getByRole('button', { name: '実サーバーで判定' }).click();
  await expect(page.getByRole('heading', { name: '判定結果: 合格', exact: true })).toBeVisible({
    timeout: 20000,
  });
  passed.push('実Route例外の診断/修正して再判定');

  await edit('app/page.tsx', solutionPage.replace('こんにちは、Next.js！', '再編集した見出し'));
  await expect(page.getByRole('button', { name: '実サーバーで判定' })).toBeDisabled();
  await expect(page.getByText('この下書きの合格記録があります。')).toHaveCount(0);
  await page.getByRole('button', { name: '保存して実行へ反映' }).click();
  await expect(status()).toContainText('実行可能', { timeout: 15000 });
  await expect(preview().locator('h1#message')).toHaveText('再編集した見出し');
  await page.getByRole('button', { name: '実サーバーで判定' }).click();
  await expect(page.getByRole('heading', { name: '判定結果: 未達成', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await stop();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'app/page.tsx', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
  await page.getByRole('button', { name: '保存して起動', exact: true }).click();
  await expect(status()).toContainText('実行可能', { timeout: 25000 });
  await expect(preview().locator('h1#message')).toHaveText('再編集した見出し');
  passed.push('再編集で合格失効/停止/下書きreload/Source再起動');

  await edit('app/page.tsx', solutionPage);
  await page.getByRole('button', { name: '保存して実行へ反映' }).click();
  await expect(status()).toContainText('実行可能', { timeout: 15000 });
  await page.getByRole('button', { name: '実サーバーで判定' }).click();
  await expect(page.getByRole('heading', { name: '判定結果: 合格', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.getByText('ヒントを見る', { exact: true }).click();
  await page.getByText('2つのファイルを比べる', { exact: true }).click();
  await page.getByRole('button', { name: '停止', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').count(), 1);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  await writeFile(`${directory}/next-ui-axe.json`, JSON.stringify(violations, null, 2));
  assert.equal(violations.length, 0, JSON.stringify(violations));
  await page.screenshot({ path: `${directory}/next-learning-ui.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('コード編集はPCから利用できます', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存して起動', exact: true })).toHaveCount(0);
  await expect(page.getByTitle('Next.jsの実サーバーPreview')).toHaveCount(0);
  assert.ok(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth,
    ),
  );
  await page.screenshot({ path: `${directory}/next-learning-narrow.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 960 });
  await expect(page.getByRole('tab', { name: 'app/page.tsx', exact: true })).toBeVisible();
  assert.equal(errors.length, 0, JSON.stringify(errors));
  passed.push('Hint/keyboard/narrow/a11y/実Preview停止');
  await page.getByRole('link', { name: '学習一覧へ戻る', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const download = await downloaded;
  const transferPath = `${directory}/next-progress.json`;
  await download.saveAs(transferPath);
  const raw = await readFile(transferPath, 'utf8');
  const bundle = JSON.parse(raw);
  assert.equal(bundle.courses.next.lessons['next-ch01-l01'].currentComplete, true);
  assert.equal(bundle.courses.next.currentComplete, false);
  assert.equal(bundle.drafts['next:next-ch01-l01-e01'].files['app/page.tsx'], solutionPage);
  assert.equal(
    bundle.drafts['next:next-ch01-l01-e01'].files['app/api/question/route.ts'],
    solutionRoute,
  );
  assert.equal(raw.includes('x-tsumucode-token'), false);
  assert.equal(raw.includes('"runId"'), false);
  const importedContext = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  try {
    const imported = await importedContext.newPage();
    await imported.goto('http://127.0.0.1:4173/#/');
    await imported
      .getByLabel('書き出した学習データを読み込む', { exact: true })
      .setInputFiles(transferPath);
    await expect(imported.getByRole('region', { name: '読み込み差分', exact: true })).toContainText(
      'next',
    );
    await imported.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
    await expect(imported.getByRole('region', { name: '読み込み差分', exact: true })).toHaveCount(
      0,
    );
    await imported.goto(
      'http://127.0.0.1:4173/#/courses/next/lessons/next-ch01-l01/exercises/next-ch01-l01-e01',
    );
    await expect(
      imported.getByRole('textbox', { name: 'app/page.tsx のコードエディター', exact: true }),
    ).toContainText('こんにちは、Next.js！');
    await expect(
      imported.getByText('この下書きの合格記録があります。', { exact: true }),
    ).toBeVisible();
    await expect(imported.getByRole('button', { name: '環境へ接続', exact: true })).toBeEnabled();
  } finally {
    await importedContext.close();
  }
  passed.push('通常Lesson完了/JSON移行/下書き・合格保持/管理資格情報なし');
  console.log(JSON.stringify({ passed, browserVersion: browser.version(), websockets }));
} catch (error) {
  await page
    .screenshot({ path: `${directory}/next-ui-failure.png`, fullPage: true })
    .catch(() => {});
  console.error(
    JSON.stringify({
      passed,
      errors,
      websockets,
      url: page.url(),
      body: (await page.locator('body').innerText()).slice(-16000),
    }),
  );
  throw error;
} finally {
  await page
    .getByRole('button', { name: '停止', exact: true })
    .click({ timeout: 3000 })
    .catch(() => {});
  await browser.close();
  for (const server of bridges) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
