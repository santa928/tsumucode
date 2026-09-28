import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { readStoredProgress, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch11/lessons/javascript-ch11-l01/exercises/javascript-ch11-l01-e01';

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

test('Keyboardで開閉して、Reset後の再編集・判定・保存を保つ', async ({ page }, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch11-l01',
    exerciseId: 'javascript-ch11-l01-e01',
    title: 'Escapeだけでヒントを閉じる',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const source = await readFile(ROOT + '/solution/script.js', 'utf8');
  await replaceAndSave(page, source);
  await refreshPreview(page);
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  // Editorの案内に従い、Esc→Tabでコード入力を抜ける。
  await page.keyboard.press('Escape');
  for (let i = 0; i < 30; i += 1) {
    if (await page.locator('.cm-content').evaluate((el) => el === document.activeElement)) {
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Tab');
    if (await frame.locator('#open').evaluate((el) => el === document.activeElement)) break;
  }
  await expect(frame.locator('#open')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(frame.locator('#hint')).toHaveText('配列のlengthで問題数が分かります');
  await page.keyboard.press('ArrowRight');
  await expect(frame.locator('#hint')).toHaveText('配列のlengthで問題数が分かります');
  await page.keyboard.press('Escape');
  await expect(frame.locator('#hint')).toHaveText('ヒントは閉じています');
  await page.keyboard.press('Space');
  await expect(frame.locator('#hint')).toHaveText('配列のlengthで問題数が分かります');
  await page.screenshot({ path: testInfo.outputPath('keyboard-result.png') });
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await waitForStoredDraftContent(page, await readFile(ROOT + '/starter/script.js', 'utf8'));
  const alternate = await readFile(ROOT + '/fixtures/early-return/script.js', 'utf8');
  await replaceAndSave(page, alternate);
  await refreshPreview(page);
  await frame.getByRole('button', { name: 'ヒントを開く', exact: true }).click();
  await expect(frame.locator('#hint')).toHaveText('配列のlengthで問題数が分かります');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('keyboard-pass.png') });
  await page.reload();
  await expect
    .poll(async () => (await readStoredProgress(page)).drafts.map((draft) => draft['files']))
    .toContainEqual(expect.objectContaining({ 'script.js': alternate }));
  await expect(frame.locator('#hint')).toHaveText('ヒントは閉じています');
  await frame.getByRole('button', { name: 'ヒントを開く', exact: true }).click();
  await expect(frame.locator('#hint')).toHaveText('配列のlengthで問題数が分かります');
});

test('Keyboardの390px読書で図とキー操作の説明を読む', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', {
      name: '一続きに読む：キーボードで開き、Escapeで閉じる',
      exact: true,
    })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch11-l01-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  await expect
    .poll(() => last.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('keyboard-reading-mobile.png') });
});
