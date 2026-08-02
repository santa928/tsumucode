import { expect, test, type Page } from '@playwright/test';
import {
  JAVASCRIPT_SOLUTION_SOURCE,
  openEditableJavaScriptExercise,
} from './helpers/javascriptCourse';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

/** JavaScript Sourceを入力し、保存済みになるまで待つ。 */
async function replaceAndSave(page: Page, source: string): Promise<void> {
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
}

/** 正しいSourceへ戻した後、同じ画面から判定成功へ回復する。 */
async function recoverToPassingResult(page: Page): Promise<void> {
  await replaceAndSave(page, JAVASCRIPT_SOLUTION_SOURCE);
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'できました' }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await observeRuntimePage(page);
  await openEditableJavaScriptExercise(page);
});

test.afterEach(async ({ page }) => {
  await expect(readRuntimeErrors(page)).resolves.toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
});

test('構文Errorはcode-errorとしてFile位置を示し、Sourceを保ったまま修正できる', async ({
  page,
}) => {
  const source = "document.querySelector('#message').textContent = '引用符が閉じていません;";
  await replaceAndSave(page, source);
  await page.getByRole('button', { name: '判定する' }).click();

  const dialog = page.getByRole('dialog', { name: '判定結果' });
  await expect(dialog.getByRole('heading', { name: 'コードを確認しよう' })).toBeVisible();
  await expect(dialog.getByRole('list', { name: '確認するコード診断' })).toContainText('script.js');
  await expect.poll(() => editorText(page)).toBe(source);
  await dialog.getByRole('button', { name: 'コードを直す' }).click();
  await expect(page.locator('.cm-content')).toBeFocused();
  await recoverToPassingResult(page);
});

test('Runtime Errorは不正解へ落とさず、Sourceを保持して同じ画面から再判定できる', async ({
  page,
}) => {
  const source =
    "document.querySelector('#missing-message').textContent = 'JavaScriptで文字を変えました';";
  await replaceAndSave(page, source);
  await page.getByRole('button', { name: '判定する' }).click();

  const dialog = page.getByRole('dialog', { name: '判定結果' });
  await expect(dialog.getByRole('heading', { name: 'コードを確認しよう' })).toBeVisible();
  await expect(dialog).toContainText('JavaScriptの実行中にエラーが起きました');
  await expect.poll(() => editorText(page)).toBe(source);
  await dialog.getByRole('button', { name: 'コードを直す' }).click();
  await recoverToPassingResult(page);
});

test('無限Loopはsystem-errorで停止し、再実行CTAとSourceを残して回復できる', async ({ page }) => {
  const source = 'while (true) {}';
  await replaceAndSave(page, source);
  await page.getByRole('button', { name: '判定する' }).click();

  const dialog = page.getByRole('dialog', { name: '判定結果' });
  await expect(dialog.getByRole('heading', { name: 'TsumuCodeで問題が起きました' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'もう一度実行する' })).toBeEnabled();
  await expect(dialog.getByRole('heading', { name: 'あと一歩' })).toHaveCount(0);
  await expect.poll(() => editorText(page)).toBe(source);
  await dialog.getByRole('button', { name: '閉じる' }).click();
  await recoverToPassingResult(page);
});
