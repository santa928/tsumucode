import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch08/lessons/javascript-ch08-l03/exercises/javascript-ch08-l03-e01';

/** 安全装置だけの取消は未達とし、実送信・Reset・別解・保存を同じ経路で確認する。 */
test('Form教材は取消忘れを拒否し、clickとEnter送信、Reset後の別解を保存できる', async ({
  page,
}, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch08-l03',
    exerciseId: 'javascript-ch08-l03-e01',
    title: '送信を止めて読書メモへ登録する',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'ヒントを見る', exact: true }).click();
  await page.getByRole('button', { name: /ヒント1を見る/u }).click();
  await expect(page.getByText('画面が残る理由を分ける', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await replaceEditorText(page, await readFile(`${ROOT}/solution/script.js`, 'utf8'));
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  await expect(frame.locator('#status')).toHaveText('登録待ち');
  const field = frame.getByLabel('本の題名', { exact: true });
  await field.fill('春の本');
  await expect(frame.locator('#status')).toHaveText('登録待ち');
  await frame.getByRole('button', { name: 'メモへ登録', exact: true }).click();
  await expect(frame.locator('#status')).toHaveText('登録: 春の本');
  await field.fill('夏の本');
  await expect(frame.locator('#status')).toHaveText('登録: 春の本');
  await field.press('Enter');
  await expect(frame.locator('#status')).toHaveText('登録: 夏の本');
  await expect(frame.locator('#note')).toHaveText('感想も残そう');
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
  await expect(frame.locator('#status')).toHaveText('登録待ち');
  await field.fill('秋の本');
  await field.press('Enter');
  await expect(frame.locator('#status')).toHaveText('登録: 秋の本');
  await page.getByRole('button', { name: '100%で見る', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('event-form-preview.png') });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('event-form-pass.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
});

/** 狭幅で4枚と送信の図を読み、前提となるEvent/valueの説明へ戻れる。 */
test('Formを390pxで通読し、Eventとvalueの既習説明へ戻る', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: 'Eventと入力のvalue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '入力のたびに表示を更新する', exact: true }),
  ).toBeVisible();
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：Formの送信を受け取って表示する', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch08-l03-s04"]');
  await last.scrollIntoViewIfNeeded();
  await expect(last.getByRole('img')).toBeVisible();
  await expect
    .poll(() =>
      last
        .getByRole('img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('event-form-reading-mobile.png') });
});
