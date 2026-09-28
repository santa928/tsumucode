import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch07/lessons/javascript-ch07-l04/exercises/javascript-ch07-l04-e01';

test('複数操作をReset後にfor-of別解で実行し、全件と対象外を確認する', async ({
  page,
}, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch07-l04',
    exerciseId: 'javascript-ch07-l04-e01',
    title: '三冊すべてを読了にする',
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
  await expect(frame.locator('#books > .book.done')).toHaveCount(3);
  await expect(frame.locator('#note')).toHaveClass('note pending');
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect
    .poll(() => editorText(page))
    .toBe(await readFile(`${ROOT}/starter/script.js`, 'utf8'));
  const alternate = await readFile(`${ROOT}/fixtures/for-of/script.js`, 'utf8');
  await replaceEditorText(page, alternate);
  await waitForStoredDraftContent(page, alternate);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(frame.locator('#books > .book.done')).toHaveCount(3);
  await page.getByRole('button', { name: '100%で見る', exact: true }).click();
  await expect(frame.locator('#third')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('many-preview-desktop.png') });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('many-pass-desktop.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
});

test('複数要素の教材を390pxで通読し、callbackの既習説明へ戻れる', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: 'callbackの説明', exact: true }).click();
  await expect(page).toHaveURL(/javascript-ch05-l01\/slides\/javascript-ch05-l01-s02/u);
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：複数の要素へ同じ変更を行う', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch07-l04-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('many-reading-mobile.png') });
});
