import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch07/lessons/javascript-ch07-l01/exercises/javascript-ch07-l01-e01';
const PILOT = './#/library/pilot';

test('DOMの誤selectorを直し、Reset後も再編集・Preview・判定できる', async ({ page }, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch07-l01',
    exerciseId: 'javascript-ch07-l01-e01',
    title: '先頭の本だけを変更する',
  });
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByText('実行できました（合否は「判定する」で確認）')).toBeVisible();
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: /次のヒントを見る/u })
    .first()
    .click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const source = await readFile(`${ROOT}/fixtures/alternate-name/script.js`, 'utf8');
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect
    .poll(() => editorText(page))
    .toBe(await readFile(`${ROOT}/starter/script.js`, 'utf8'));
  await replaceEditorText(page, source);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  await expect(frame.locator('#first')).toHaveText('読書を始めます');
  await expect(frame.locator('#second')).toHaveText('二冊目');
  // 編集後はEscape→TabでCodeMirrorを抜け、採点ボタンまで実際にTab移動する。
  await page.locator('.cm-content').click();
  await page.keyboard.press('Escape');
  const judge = page.getByRole('button', { name: '判定する', exact: true });
  for (
    let i = 0;
    i < 40 && !(await judge.evaluate((node) => node === document.activeElement));
    i += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(judge).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'できました', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dom-pass-desktop.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(source);
});

test('試用目次からDOMの4枚を狭幅で読み、未完成Lessonを先読みしない', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const lessonRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/lessons/')) lessonRequests.push(request.url());
  });
  await page.goto(PILOT);
  await expect(page.getByRole('link', { name: '変数の説明', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ifの説明', exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: '一続きに読む：要素を探して文字を変える', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch07-l01-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(lessonRequests.filter((url) => /javascript-ch07-l0[2-9]/u.test(url))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('dom-reading-mobile.png') });
  await page.goto(`${PILOT}/javascript/lessons/javascript-ch07-l02/read`);
  await expect(page).toHaveURL(/#\/library\/pilot$/u);
});
