import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch08/lessons/javascript-ch08-l02/exercises/javascript-ch08-l02-e01';

/** 直接入力中の表示からReset、別解の採点と保存まで同じ学習経路を確かめる。 */
test('input教材は入力中と全削除に反応し、Reset後の別解も採点・保存できる', async ({
  page,
}, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch08-l02',
    exerciseId: 'javascript-ch08-l02-e01',
    title: '入力した題名を読書メモへ映す',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'ヒントを見る', exact: true }).click();
  await page.getByRole('button', { name: /ヒント1を見る/u }).click();
  await expect(page.getByText('値を読んだのはいつ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await replaceEditorText(page, await readFile(`${ROOT}/solution/script.js`, 'utf8'));
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  await expect(frame.locator('#status')).toHaveText('入力待ち');
  const field = frame.getByLabel('本の題名', { exact: true });
  for (const value of ['春の本', '夏の本', '']) {
    await field.fill(value);
    await expect(field).toBeFocused();
    await expect(frame.locator('#status')).toHaveText(`読みたい本: ${value}`.trimEnd());
    await expect(frame.locator('#note')).toHaveText('メモを残そう');
  }
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect
    .poll(() => editorText(page))
    .toBe(await readFile(`${ROOT}/starter/script.js`, 'utf8'));
  const alternate = await readFile(`${ROOT}/fixtures/field-value/script.js`, 'utf8');
  await replaceEditorText(page, alternate);
  await waitForStoredDraftContent(page, alternate);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(frame.locator('#status')).toHaveText('入力待ち');
  await field.pressSequentially('Book');
  await expect(frame.locator('#status')).toHaveText('読みたい本: Book');
  await page.getByRole('button', { name: '100%で見る', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('event-input-preview.png') });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('event-input-pass.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
});

/** 既習propertyへ戻れることと、390px通読の実寸・図の読込を確認する。 */
test('inputの現在値を390pxで通読し、Objectの既習説明へ戻る', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: 'Objectのpropertyを読む説明', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'dotの後ろへproperty名を書く', exact: true }),
  ).toBeVisible();
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：入力のたびに表示を更新する', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch08-l02-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  await expect
    .poll(() =>
      last
        .getByRole('img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('event-input-reading-mobile.png') });
});
