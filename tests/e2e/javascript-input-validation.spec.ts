import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const ROOT =
  'content/javascript/chapters/javascript-ch08/lessons/javascript-ch08-l04/exercises/javascript-ch08-l04-e01';

/** 更新前のiframeを操作しないよう、文書の切替と実行完了を待つ。 */
async function refreshPreview(page: Page): Promise<void> {
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  const previous = await iframe.getAttribute('srcdoc');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(iframe).not.toHaveAttribute('srcdoc', previous ?? '');
  await expect(page.getByRole('button', { name: 'プレビューを更新', exact: true })).toBeEnabled();
}

/** 無効入力を拒否し、登録済みを保ったまま次の有効入力へ回復できる。 */
test('入力検証は空白を拒否し、Reset後も登録済みを守って再入力できる', async ({
  page,
}, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch08-l04',
    exerciseId: 'javascript-ch08-l04-e01',
    title: '空白だけの題名を登録しない',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'ヒントを見る', exact: true }).click();
  await page.getByRole('button', { name: /ヒント1を見る/u }).click();
  await expect(page.getByText('空白は文字として残っている', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await replaceEditorText(page, await readFile(`${ROOT}/solution/script.js`, 'utf8'));
  await refreshPreview(page);
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  const field = frame.getByLabel('本の題名', { exact: true });
  await expect(frame.locator('#saved')).toHaveText('未登録');
  await field.fill('  春 の 本  ');
  await frame.getByRole('button', { name: 'メモへ登録', exact: true }).click();
  await expect(frame.locator('#saved')).toHaveText('登録済み: 春 の 本');
  await expect(field).toHaveValue('  春 の 本  ');
  await field.fill('   ');
  await expect(frame.locator('#status')).toHaveText('登録しました');
  await field.press('Enter');
  await expect(frame.locator('#status')).toHaveText('題名を入力してください');
  await expect(frame.locator('#saved')).toHaveText('登録済み: 春 の 本');
  await page.screenshot({ path: testInfo.outputPath('validation-invalid.png') });
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
  await field.fill('夏の本');
  await field.press('Enter');
  await expect(frame.locator('#status')).toHaveText('登録しました');
  await expect(frame.locator('#saved')).toHaveText('登録済み: 夏の本');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('validation-pass.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(alternate);
});

/** 狭幅でも分岐図を読み、前提となるFormとifへ戻れる。 */
test('入力検証を390pxで通読し、Formとifの説明へ戻る', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: 'ifの分岐', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'ifはtrueのときに実行する', exact: true }),
  ).toBeVisible();
  await page.goto('./#/library/pilot');
  await page.getByRole('link', { name: 'Formの送信と取消', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Formの送信を受け取って表示する', exact: true }),
  ).toBeVisible();
  await page.goto('./#/library/pilot');
  await page
    .getByRole('link', { name: '一続きに読む：空欄を確かめてから登録する', exact: true })
    .click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const last = page.locator('[data-reading-section="javascript-ch08-l04-s04"]');
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
  await page.screenshot({ path: testInfo.outputPath('validation-reading-mobile.png') });
});
