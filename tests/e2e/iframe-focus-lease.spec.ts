import { expect, test } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

test('iframe操作から戻る最初のReset clickで確認を開き、同じ実行状態を保持する', async ({
  page,
}) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch07-l02',
    exerciseId: 'javascript-ch07-l02-e01',
    title: '一冊目だけを読了の見た目にする',
  });
  const source =
    "const book = document.querySelector('#first');\nbook.addEventListener('click', () => { book.textContent = '操作済み'; });";
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  const original = await iframe.elementHandle();
  const frame = iframe.contentFrame();
  await frame.locator('#first').click();
  await expect(frame.locator('#first')).toHaveText('操作済み');
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: '最初のコードに戻す', exact: true }),
  ).toBeEnabled();
  expect(await original?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(frame.locator('#first')).toHaveText('操作済み');
  await dialog.getByRole('button', { name: '最初のコードに戻す', exact: true }).click();
  await expect.poll(() => editorText(page)).toContain("book.classList.add('ready')");
  await expect(frame.locator('#first')).toHaveText('一冊目');
});
