import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch07/lessons/javascript-ch07-l03/exercises/javascript-ch07-l03-e01';

test('要素追加をReset後に別名と別順序で実行し、判定と保存へつなぐ', async ({ page }, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch07-l03',
    exerciseId: 'javascript-ch07-l03-e01',
    title: '本のリストへ新しい項目を追加する',
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
  await expect(frame.locator('#books > li')).toHaveText(['読みかけの本', '次に読む本']);
  await expect(frame.locator('#notes > li')).toHaveText(['図書館で探す']);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect
    .poll(() => editorText(page))
    .toBe(await readFile(`${ROOT}/starter/script.js`, 'utf8'));
  const alternate = await readFile(`${ROOT}/fixtures/text-after-append/script.js`, 'utf8');
  await replaceEditorText(page, alternate);
  await waitForStoredDraftContent(page, alternate);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(frame.locator('#books > li')).toHaveText(['読みかけの本', '次に読む本']);
  await page.getByRole('button', { name: '100%で見る', exact: true }).click();
  await expect(frame.locator('#books > li:last-child')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('create-preview-desktop.png') });
  const judge = page.getByRole('button', { name: '判定する', exact: true });
  await judge.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
});

test('要素生成の4枚を390pxで通読し、接続図まで到達する', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：要素を作ってページへ追加する', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch07-l03-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('create-reading-mobile.png') });
});
