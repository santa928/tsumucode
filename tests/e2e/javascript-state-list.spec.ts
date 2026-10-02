import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch09/lessons/javascript-ch09-l03/exercises/javascript-ch09-l03-e01';

/** 古い表示へ操作せず、新しいPreviewの準備完了を待つ。 */
async function refreshPreview(page: Page): Promise<void> {
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  const previous = await iframe.getAttribute('srcdoc');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(iframe).not.toHaveAttribute('srcdoc', previous ?? '');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
}

test('Arrayの一覧を重複なく描き、空状態とReset後の再編集・判定・保存を保つ', async ({
  page,
}, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch09-l03',
    exerciseId: 'javascript-ch09-l03-e01',
    title: '本の一覧の重複を直す',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const source = await readFile(`${ROOT}/solution/script.js`, 'utf8');
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
  await refreshPreview(page);
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  for (const [name, items] of [
    ['海の本を追加', ['星の本', '海の本']],
    ['海の本を追加', ['星の本', '海の本', '海の本']],
    ['一覧を空にする', []],
    ['一覧を空にする', []],
    ['海の本を追加', ['海の本']],
  ] as const) {
    await frame.getByRole('button', { name, exact: true }).click();
    await expect(frame.locator('#books > li')).toHaveText([...items]);
    await expect(frame.locator('#count')).toHaveText('冊数: ' + String(items.length));
  }
  await page.screenshot({ path: testInfo.outputPath('list-clear-and-add.png') });
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect
    .poll(() => editorText(page))
    .toBe(await readFile(`${ROOT}/starter/script.js`, 'utf8'));
  const alternate = await readFile(`${ROOT}/fixtures/text-clear/script.js`, 'utf8');
  await replaceEditorText(page, alternate);
  await waitForStoredDraftContent(page, alternate);
  await refreshPreview(page);
  await frame.getByRole('button', { name: '海の本を追加', exact: true }).click();
  await expect(frame.locator('#books > li')).toHaveText(['星の本', '海の本']);
  await expect(frame.locator('#count')).toHaveText('冊数: 2');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('list-pass.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
  await expect(frame.locator('#books > li')).toHaveText(['星の本']);
  await expect(frame.locator('#count')).toHaveText('冊数: 1');
});

test('一覧の390px読書で図と空Arrayを読み、DOM説明へ戻れる', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: '要素を作って接続する説明', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '作った要素へ文字を入れる', exact: true }),
  ).toBeVisible();
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：状態の配列から一覧を作り直す', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch09-l03-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  await expect
    .poll(() => last.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('list-reading-mobile.png') });
});
