import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch09/lessons/javascript-ch09-l01/exercises/javascript-ch09-l01-e01';

/** 更新前のiframeを操作せず、新しい実行が操作可能になるまで待つ。 */
async function refreshPreview(page: Page): Promise<void> {
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  const previous = await iframe.getAttribute('srcdoc');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(iframe).not.toHaveAttribute('srcdoc', previous ?? '');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
}

test('Stateを複数clickで更新し、再PreviewとReset後も別解で判定・再開できる', async ({
  page,
}, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch09-l01',
    exerciseId: 'javascript-ch09-l01-e01',
    title: '押すたびに読了数を増やす',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const source = await readFile(`${ROOT}/solution/script.js`, 'utf8');
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
  await refreshPreview(page);
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  for (let count = 1; count <= 3; count += 1) {
    await frame.getByRole('button', { name: '一冊読み終えた', exact: true }).click();
    await expect(frame.locator('#status')).toHaveText(`読了数: ${String(count)}`);
  }
  await page.screenshot({ path: testInfo.outputPath('state-three-clicks.png') });
  await refreshPreview(page);
  await expect(frame.locator('#status')).toHaveText('読了数: 0');
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect
    .poll(() => editorText(page))
    .toBe(await readFile(`${ROOT}/starter/script.js`, 'utf8'));
  const alternate = await readFile(`${ROOT}/fixtures/named-handler/script.js`, 'utf8');
  await replaceEditorText(page, alternate);
  await waitForStoredDraftContent(page, alternate);
  await refreshPreview(page);
  await frame.getByRole('button', { name: '一冊読み終えた', exact: true }).click();
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('state-pass.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
});

test('Stateの390px読書で図を読み、Closureの説明へ戻れる', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: 'Closureが覚える値', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '得点係ごとに値を覚える', exact: true }),
  ).toBeVisible();
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：操作の間で値を覚えておく', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch09-l01-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  await expect
    .poll(() => last.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('state-reading-mobile.png') });
});
