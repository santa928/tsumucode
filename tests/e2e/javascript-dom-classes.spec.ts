import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch07/lessons/javascript-ch07-l02/exercises/javascript-ch07-l02-e01';

test('classの修正とReset後の別解が実DOM判定に反映される', async ({ page }, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch07-l02',
    exerciseId: 'javascript-ch07-l02-e01',
    title: '一冊目だけを読了の見た目にする',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: /次のヒントを見る/u })
    .first()
    .click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await replaceEditorText(page, await readFile(`${ROOT}/solution/script.js`, 'utf8'));
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  await expect(frame.locator('#first')).toHaveClass('book done');
  await expect(frame.locator('#second')).toHaveClass('book pending');
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect
    .poll(() => editorText(page))
    .toBe(await readFile(`${ROOT}/starter/script.js`, 'utf8'));
  const alternate = await readFile(`${ROOT}/fixtures/class-order/script.js`, 'utf8');
  await replaceEditorText(page, alternate);
  await waitForStoredDraftContent(page, alternate);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(frame.locator('#first')).toHaveClass('done book');
  await page.screenshot({ path: testInfo.outputPath('classes-preview-desktop.png') });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('classes-pass-desktop.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
});

test('class教材を390pxで通読し、共通classの既習説明へ進める', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: '共通のclassの説明', exact: true }).click();
  await expect(page).toHaveURL(/html-css-ch06-l04\/slides\/html-css-ch06-l04-s01/u);
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：classを付け外しして見た目を変える', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch07-l02-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('classes-reading-mobile.png') });
});
