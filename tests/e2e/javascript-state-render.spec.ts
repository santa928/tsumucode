import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch09/lessons/javascript-ch09-l02/exercises/javascript-ch09-l02-e01';

/** 古い表示へ操作せず、新しいPreviewの準備完了を待つ。 */
async function refreshPreview(page: Page): Promise<void> {
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  const previous = await iframe.getAttribute('srcdoc');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(iframe).not.toHaveAttribute('srcdoc', previous ?? '');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
}

test('state更新後のrenderで両表示をそろえ、Reset後も再編集・判定・保存再開できる', async ({
  page,
}, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch09-l02',
    exerciseId: 'javascript-ch09-l02-e01',
    title: '読了数と次の冊数をそろえる',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const source = await readFile(`${ROOT}/solution/script.js`, 'utf8');
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
  await refreshPreview(page);
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  for (const [name, count] of [
    ['一冊読み終えた', 1],
    ['一冊読み終えた', 2],
    ['0に戻す', 0],
    ['0に戻す', 0],
    ['一冊読み終えた', 1],
  ] as const) {
    await frame.getByRole('button', { name, exact: true }).click();
    await expect(frame.locator('#status')).toHaveText(`読了数: ${String(count)}`);
    await expect(frame.locator('#next')).toHaveText(`次は${String(count + 1)}冊目`);
  }
  await page.screenshot({ path: testInfo.outputPath('render-reset-and-read.png') });
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect
    .poll(() => editorText(page))
    .toBe(await readFile(`${ROOT}/starter/script.js`, 'utf8'));
  const alternate = await readFile(`${ROOT}/fixtures/double-render/script.js`, 'utf8');
  await replaceEditorText(page, alternate);
  await waitForStoredDraftContent(page, alternate);
  await refreshPreview(page);
  await frame.getByRole('button', { name: '一冊読み終えた', exact: true }).click();
  await expect(frame.locator('#status')).toHaveText('読了数: 1');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('render-pass.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
  await expect(frame.locator('#status')).toHaveText('読了数: 0');
  await expect(frame.locator('#next')).toHaveText('次は1冊目');
});

test('renderの390px読書で図と表示順序を読み、State説明へ戻れる', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: '操作の間で値を保持する説明', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '操作の間で値を覚えておく', exact: true }),
  ).toBeVisible();
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：状態から表示をそろえる', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch09-l02-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  await expect
    .poll(() => last.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('render-reading-mobile.png') });
});
