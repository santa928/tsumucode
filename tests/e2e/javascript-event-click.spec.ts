import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch08/lessons/javascript-ch08-l01/exercises/javascript-ch08-l01-e01';

test('click教材は待機→直接操作で変化し、Reset後の名前付きFunctionも採点・保存できる', async ({
  page,
}, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch08-l01',
    exerciseId: 'javascript-ch08-l01-e01',
    title: '押したときだけ本を開く',
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
  await expect(frame.locator('#status')).toHaveText('まだ開いていません');
  await frame.getByRole('button', { name: '本を開く', exact: true }).click();
  await expect(frame.locator('#status')).toHaveText('本を開きました');
  await expect(frame.locator('#note')).toHaveText('本を大切に');
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
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(frame.locator('#status')).toHaveText('まだ開いていません');
  await frame.getByRole('button', { name: '本を開く', exact: true }).press('Enter');
  await expect(frame.locator('#status')).toHaveText('本を開きました');
  await page.getByRole('button', { name: '100%で見る', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('event-click-preview.png') });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('event-click-pass.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
});

test('clickの登録と実行を390pxで通読し、Function呼出しの既習説明へ戻る', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: 'Functionを呼ぶ説明', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '名前と丸括弧でFunctionを呼び出す', exact: true }),
  ).toBeVisible();
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：クリックしたときに処理する', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch08-l01-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('event-click-reading-mobile.png') });
});
