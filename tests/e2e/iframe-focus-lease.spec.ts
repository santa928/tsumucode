import { readFile } from 'node:fs/promises';
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

/** iframeから親へ戻る操作自体がfocus再確認を起こしても、最初のクリックを失わない。 */
test('iframe入力直後の最初のPreview・判定clickを再確認後に実行する', async ({ page }) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch08-l02',
    exerciseId: 'javascript-ch08-l02-e01',
    title: '入力した題名を読書メモへ映す',
  });
  const source = await readFile(
    'content/javascript/chapters/javascript-ch08/lessons/javascript-ch08-l02/exercises/javascript-ch08-l02-e01/solution/script.js',
    'utf8',
  );
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  const frame = iframe.contentFrame();
  const previous = await iframe.getAttribute('srcdoc');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(iframe).not.toHaveAttribute('srcdoc', previous ?? '');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  await frame.getByLabel('本の題名', { exact: true }).fill('最初の入力');
  const beforeManualPreview = await iframe.getAttribute('srcdoc');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(iframe).not.toHaveAttribute('srcdoc', beforeManualPreview ?? '');
  await expect(frame.getByLabel('本の題名', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  await frame.getByLabel('本の題名', { exact: true }).fill('次の入力');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
});

/** DOMへ強制focusせず、利用者と同じEsc→Tabからiframeの入力へ到達し、親へ戻る。 */
test('KeyboardだけでPreviewへ入り入力し、親へ戻って判定する', async ({ page }) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch08-l02',
    exerciseId: 'javascript-ch08-l02-e01',
    title: '入力した題名を読書メモへ映す',
  });
  const source = await readFile(
    'content/javascript/chapters/javascript-ch08/lessons/javascript-ch08-l02/exercises/javascript-ch08-l02-e01/solution/script.js',
    'utf8',
  );
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  const old = await iframe.getAttribute('srcdoc');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(iframe).not.toHaveAttribute('srcdoc', old ?? '');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const field = iframe.contentFrame().getByLabel('本の題名', { exact: true });
  await page.keyboard.press('Escape');
  for (let i = 0; i < 30; i += 1) {
    if (await page.locator('.cm-content').evaluate((el) => el === document.activeElement)) {
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Tab');
    if (await field.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(field).toBeFocused();
  const original = await iframe.elementHandle();
  await page.keyboard.insertText('キーボードで読書');
  await expect(iframe.contentFrame().locator('#status')).toHaveText('読みたい本: キーボードで読書');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '説明を見直す', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'ヒントを見る', exact: true })).toBeFocused();
  expect(await original?.evaluate((el) => el.isConnected)).toBe(true);
  await expect(field).toHaveValue('キーボードで読書');
  const judge = page.getByRole('button', { name: '判定する', exact: true });
  await expect(judge).toBeEnabled();
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    if (await judge.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
});

/** 標準buttonの矢印キーで全体Previewが横ずれせず、100%表示の水平移動は残す。 */
test('全体PreviewはKeyboard操作後も収まり、100%表示では左右へ動かせる', async ({
  page,
}, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch08-l01',
    exerciseId: 'javascript-ch08-l01-e01',
    title: '押したときだけ本を開く',
  });
  const source = await readFile(
    'content/javascript/chapters/javascript-ch08/lessons/javascript-ch08-l01/exercises/javascript-ch08-l01-e01/solution/script.js',
    'utf8',
  );
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  const previous = await iframe.getAttribute('srcdoc');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(iframe).not.toHaveAttribute('srcdoc', previous ?? '');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const frame = iframe.contentFrame();
  const button = frame.getByRole('button', { name: '本を開く', exact: true });
  await page.keyboard.press('Escape');
  for (let i = 0; i < 30; i += 1) {
    if (await page.locator('.cm-content').evaluate((el) => el === document.activeElement)) {
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Tab');
    if (await button.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(frame.locator('#status')).toHaveText('本を開きました');
  await page.keyboard.press('ArrowRight');
  const scroll = page.getByTestId('runtime-preview-scroll');
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(1);
  await expect(scroll).toHaveJSProperty('scrollLeft', 0);
  const viewportWidth = await frame.locator('html').evaluate((el) => el.clientWidth);
  const iframeNode = await iframe.elementHandle();
  const containerBounds = await scroll.boundingBox();
  const frameBounds = await iframe.boundingBox();
  expect(containerBounds).not.toBeNull();
  expect(frameBounds).not.toBeNull();
  expect(frameBounds!.x).toBeGreaterThanOrEqual(containerBounds!.x - 1);
  expect(frameBounds!.x + frameBounds!.width).toBeLessThanOrEqual(
    containerBounds!.x + containerBounds!.width + 1,
  );
  await page.screenshot({ path: testInfo.outputPath('preview-fit-keyboard.png') });
  await page.getByRole('button', { name: '100%で見る', exact: true }).click();
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeGreaterThan(1);
  await scroll.evaluate((el) => {
    el.scrollLeft = 100;
  });
  await expect(scroll).toHaveJSProperty('scrollLeft', 100);
  await page.screenshot({ path: testInfo.outputPath('preview-actual-scroll.png') });
  await page.getByRole('button', { name: '全体表示に戻す', exact: true }).click();
  await expect(scroll).toHaveJSProperty('scrollLeft', 0);
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeLessThanOrEqual(1);
  expect(await iframeNode?.evaluate((el) => el.isConnected)).toBe(true);
  expect(await frame.locator('html').evaluate((el) => el.clientWidth)).toBe(viewportWidth);
  await expect(frame.locator('#status')).toHaveText('本を開きました');
});
