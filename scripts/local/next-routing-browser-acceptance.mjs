import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parse } from 'yaml';
import { bridge } from './browser-test-bridge.mjs';

// 作者/CI専用。通常Lessonから固定実Nextの表示・操作・保存・失敗回復を確認する。
const bridges = [await bridge(4173, 'web'), await bridge(4175, 'preview')];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await context.newPage();
const directory = process.env.TSUMUCODE_NEXT_EVIDENCE ?? '.release-issue133';
await mkdir(directory, { recursive: true });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const passed = [];
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
  await expect(status()).toContainText('実行可能', { timeout: 15000 });
}
async function grade(name) {
  const button = page.getByRole('button', { name: '実サーバーで判定', exact: true });
  // iframeから戻ったfocusで編集権を再確認する。親の安定したStageへ戻って待つ。
  await page.getByTestId('learning-stage').focus();
  await expect(
    page.getByText('編集権を再確認しています。保存を伴う操作は確認後に再開します。', {
      exact: true,
    }),
  ).toBeHidden();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('heading', { name: `判定結果: ${name}`, exact: true })).toBeVisible({
    timeout: 20000,
  });
}
try {
  for (const lesson of ['next-ch02-l01', 'next-ch02-l02']) {
    const workspace = `${lesson}-e01`;
    const root = `content/next/chapters/next-ch02/lessons/${lesson}/exercises/${workspace}`;
    const exercise = parse(await readFile(`${root}/exercise.yaml`, 'utf8'));
    await page.goto(`http://127.0.0.1:4173/#/courses/next/lessons/${lesson}/slides/${lesson}-s01`);
    for (let index = 0; index < 4; index++) {
      // URL更新後も前のSlideが残るため、表示中のSlide IDまで待つ。
      await expect(page.getByTestId('slide-stage')).toHaveAttribute(
        'data-slide-id',
        `${lesson}-s0${index + 1}`,
      );
      const prediction = page.getByRole('region', { name: '結果を予測する', exact: true });
      await expect(prediction.locator('details')).not.toHaveAttribute('open', '');
      const summary = prediction.locator('summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(prediction.locator('details')).toHaveAttribute('open', '');
      await page.keyboard.press('Enter');
      await expect(prediction.locator('details')).not.toHaveAttribute('open', '');
      if (index < 3)
        await page.getByRole('link', { name: '次のスライドへ →', exact: true }).click();
    }
    await page.getByRole('link', { name: /のコード演習を始める/u }).click();
    await expect(
      page.getByRole('heading', { name: exercise.title, exact: true, level: 1 }),
    ).toBeVisible();
    await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
    await page.getByRole('button', { name: '保存して起動', exact: true }).click();
    await expect(status()).toContainText('実行可能', { timeout: 25000 });
    await grade(
      exercise.fixtures.find(({ id }) => id === 'starter').expectedStatus === 'code-error'
        ? 'コードエラー'
        : '未達成',
    );
    const writable = exercise.files.filter(({ editable }) => editable);
    for (const file of writable)
      await edit(file.path, await readFile(`${root}/solution/${file.path}`, 'utf8'));
    await expect(
      page.getByRole('button', { name: '実サーバーで判定', exact: true }),
    ).toBeDisabled();
    await apply();
    if (lesson === 'next-ch02-l01') {
      await preview().getByRole('link', { name: '旅行一覧へ', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(preview().locator('#trip-layout')).toHaveText('旅行ノート');
      await preview().getByRole('link', { name: '海の旅へ', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(preview().locator('#trip-slug')).toHaveText('sea');
      await page.getByLabel('表示する応答').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('表示する応答')).toHaveValue('trips/forest');
      await expect(preview().locator('#trip-slug')).toHaveText('forest');
      await page.getByLabel('表示する応答').selectOption('');
    } else {
      await expect(preview().locator('#server-note')).toHaveText('server-note.txt');
      await expect(preview().locator('#count')).toHaveText('2');
      for (const count of ['3', '4']) {
        await preview().getByRole('button', { name: '数を増やす', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(preview().locator('#count')).toHaveText(count);
      }
    }
    await grade('合格');
    const file = writable.at(-1);
    const correct = await readFile(`${root}/solution/${file.path}`, 'utf8');
    await edit(
      file.path,
      lesson === 'next-ch02-l02'
        ? correct.replace(/^'use client';\s*/u, '')
        : correct + '\nexport const broken = ;\n',
    );
    await expect(
      page.getByRole('button', { name: '実サーバーで判定', exact: true }),
    ).toBeDisabled();
    await expect(page.getByText('この下書きの合格記録があります。')).toHaveCount(0);
    await apply();
    await grade('コードエラー');
    await edit(file.path, correct);
    await apply();
    await grade('合格');
    await page.getByText('ヒントを見る', { exact: true }).click();
    await page.getByText(exercise.hints[0].title, { exact: true }).click();
    await page.getByRole('button', { name: '停止', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').count(), 1);
    assert.equal((await new AxeBuilder({ page }).analyze()).violations.length, 0);
    await page.screenshot({ path: `${directory}/${lesson}-ui.png`, fullPage: true });
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await expect(status()).toContainText('停止済み');
    await page.reload();
    await expect(page.getByRole('tab', { name: file.path, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '環境へ接続', exact: true }).click();
    await page.getByRole('button', { name: '保存して起動', exact: true }).click();
    await expect(status()).toContainText('実行可能', { timeout: 25000 });
    await grade('合格');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('コード編集はPCから利用できます', { exact: true })).toBeVisible();
    await expect(page.getByTitle('Next.jsの実サーバーPreview')).toHaveCount(0);
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.window.innerWidth,
      ),
    );
    await page.screenshot({ path: `${directory}/${lesson}-narrow.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 960 });
    passed.push({
      lesson,
      observations: [
        '通常Slideと演習',
        '初期未達成または境界診断/編集/反映/合格',
        '実URLまたはclick',
        '構文またはuse client不足/修正/版失効',
        '停止/reload/Source再起動',
        'Hint/keyboard/narrow/axe0',
      ],
    });
  }
  await page.getByRole('link', { name: '学習一覧へ戻る', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const download = await downloaded;
  const path = `${directory}/next-routing-progress.json`;
  await download.saveAs(path);
  const raw = await readFile(path, 'utf8');
  const bundle = JSON.parse(raw);
  for (const lesson of ['next-ch02-l01', 'next-ch02-l02']) {
    assert.equal(bundle.courses.next.lessons[lesson].currentComplete, true);
    assert.ok(bundle.drafts[`next:${lesson}-e01`]);
  }
  assert.equal(raw.includes('x-tsumucode-token'), false);
  assert.equal(raw.includes('"runId"'), false);
  const imported = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const importedPage = await imported.newPage();
  try {
    await importedPage.goto('http://127.0.0.1:4173/#/');
    await importedPage
      .getByLabel('書き出した学習データを読み込む', { exact: true })
      .setInputFiles(path);
    await expect(
      importedPage.getByRole('region', { name: '読み込み差分', exact: true }),
    ).toBeVisible();
    await importedPage.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
    await expect(
      importedPage.getByRole('region', { name: '読み込み差分', exact: true }),
    ).toHaveCount(0);
    for (const lesson of ['next-ch02-l01', 'next-ch02-l02']) {
      await importedPage.goto(
        `http://127.0.0.1:4173/#/courses/next/lessons/${lesson}/exercises/${lesson}-e01`,
      );
      await expect(importedPage.getByText('この下書きの合格記録があります。')).toBeVisible();
    }
  } finally {
    await imported.close();
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(
    JSON.stringify({
      passed,
      browser: browser.version(),
      pageErrors: errors,
      transfer: '両Lesson下書き/合格記録export/import、管理token/run非含有',
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ passed, errors, status: await status().allTextContents() }));
  await page.screenshot({ path: `${directory}/next-routing-ui-failure.png`, fullPage: true });
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
