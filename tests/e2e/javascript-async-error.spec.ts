import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { readStoredProgress, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch10/lessons/javascript-ch10-l03/exercises/javascript-ch10-l03-e01';

/** 古い表示へ操作せず、新しいPreviewの準備完了を待つ。 */
async function refreshPreview(page: Page): Promise<void> {
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  const previous = await iframe.getAttribute('srcdoc');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(iframe).not.toHaveAttribute('srcdoc', previous ?? '');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
}

/** 長いコードの仮想描画DOMを全文とみなさず、保存されたDocumentで置換を確認する。 */
async function replaceAndSave(page: Page, source: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(source);
  await waitForStoredDraftContent(page, source);
}

test('失敗を表示し再試行して、Reset後の再編集・判定・保存を保つ', async ({ page }, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch10-l03',
    exerciseId: 'javascript-ch10-l03-e01',
    title: '失敗を知らせ、もう一度読み込む',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const source = await readFile(ROOT + '/solution/script.js', 'utf8');
  await replaceAndSave(page, source);
  await refreshPreview(page);
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  await expect(frame.locator('#result')).toHaveText('まだ読んでいません');
  for (let i = 0; i < 2; i++) {
    await frame.getByRole('button', { name: '成功を試す', exact: true }).click();
    await expect(frame.locator('#result')).toHaveText('問題: 2');
  }
  await frame.getByRole('button', { name: '失敗を試す', exact: true }).click();
  await expect(frame.locator('#result')).toHaveText('読み込めませんでした');
  await page.screenshot({ path: testInfo.outputPath('catch-result.png') });
  await frame.getByRole('button', { name: '成功を試す', exact: true }).click();
  await expect(frame.locator('#result')).toHaveText('問題: 2');
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await waitForStoredDraftContent(page, await readFile(ROOT + '/starter/script.js', 'utf8'));
  const alternate = await readFile(ROOT + '/fixtures/promise-catch/script.js', 'utf8');
  await replaceAndSave(page, alternate);
  await refreshPreview(page);
  await frame.getByRole('button', { name: '成功を試す', exact: true }).click();
  await expect(frame.locator('#result')).toHaveText('問題: 2');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('catch-pass.png') });
  await page.reload();
  await expect
    .poll(async () => (await readStoredProgress(page)).drafts.map((draft) => draft['files']))
    .toContainEqual(expect.objectContaining({ 'script.js': alternate }));
  await expect(frame.locator('#result')).toHaveText('まだ読んでいません');
  await frame.getByRole('button', { name: '成功を試す', exact: true }).click();
  await expect(frame.locator('#result')).toHaveText('問題: 2');
});

test('失敗処理の390px読書で図と同梱データの説明を読む', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：失敗を受け取り、もう一度試す', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch10-l03-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  await expect
    .poll(() => last.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('catch-reading-mobile.png') });
});
