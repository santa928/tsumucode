import { expect, test } from '@playwright/test';
import {
  JAVASCRIPT_EXERCISE_ID,
  JAVASCRIPT_SOLUTION_SOURCE,
  JAVASCRIPT_STARTER_SOURCE,
  openEditableJavaScriptExercise,
} from './helpers/javascriptCourse';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';

const previewFrame = (page: Parameters<typeof editorText>[0]) =>
  page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();

/** 現在選択中のFileへ全文を入力し、IndexedDBへの保存まで待つ。 */
async function replaceAndSave(
  page: Parameters<typeof editorText>[0],
  source: string,
): Promise<void> {
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
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

test('直接URLでscript.jsを初期選択し、JavaScriptのTokenを色分けして表示する', async ({ page }) => {
  const scriptTab = page.getByRole('tab', { name: 'script.js', exact: true });
  await expect(scriptTab).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => editorText(page)).toBe(JAVASCRIPT_STARTER_SOURCE);
  await expect(
    page.getByText('<script>はプレビューで使えないため外しました', { exact: true }),
  ).toHaveCount(0);
  await expect(
    previewFrame(page).getByRole('heading', { name: 'ここを書き換えます' }),
  ).toBeVisible();

  const tokenPaint = await page.locator('.cm-editor').evaluate((editor) => {
    const background = getComputedStyle(editor).backgroundColor;
    const tokens = Array.from(editor.querySelectorAll<HTMLElement>('.cm-line span'))
      .map((token) => ({ color: getComputedStyle(token).color, text: token.textContent }))
      .filter(({ text }) => text.trim().length > 0);
    return { background, tokens };
  });
  expect(new Set(tokenPaint.tokens.map(({ color }) => color)).size).toBeGreaterThanOrEqual(2);
  expect(tokenPaint.tokens.some(({ text }) => text.includes('querySelector'))).toBe(true);
  expect(tokenPaint.tokens.some(({ text }) => text.includes('ここを書き換えます'))).toBe(true);
  expect(tokenPaint.tokens.every(({ color }) => color !== tokenPaint.background)).toBe(true);
});

test('HTMLだけを完成表示へ偽装しても不合格で、正しいJavaScriptだけが合格する', async ({ page }) => {
  await page.getByRole('tab', { name: 'index.html', exact: true }).click();
  const spoofedHtml = `<!doctype html>
<html lang="ja">
  <body>
    <main><h1 id="message">JavaScriptで文字を変えました</h1></main>
    <script src="script.js"></script>
  </body>
</html>`;
  await replaceAndSave(page, spoofedHtml);
  const validate = page.getByRole('button', { name: '判定する' });
  await validate.click();
  await expect(page.getByRole('heading', { name: 'あと一歩' })).toBeVisible();
  await expect(validate).toBeEnabled();
  await expect(page.getByTestId('learning-completion')).toHaveCount(0);

  await page.getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('tab', { name: 'script.js', exact: true }).click();
  await replaceAndSave(page, JAVASCRIPT_SOLUTION_SOURCE);
  await validate.click();
  const resultDialog = page.getByRole('dialog', { name: '判定結果' });
  await expect(resultDialog.getByRole('heading', { name: 'できました' })).toBeVisible();
  await expect(resultDialog).toContainText('必要なピースをすべて積めました。');
});

test('Console出力を確認して画面へ戻り、判定・Reset・再読込まで非永続で学習できる', async ({
  page,
}) => {
  const source = `console.log('hello');
document.querySelector('#message').textContent = 'JavaScriptで文字を変えました';\n`;
  await replaceAndSave(page, source);

  const update = page.getByRole('button', { name: 'プレビューを更新' });
  await update.click();
  await expect(update).toBeEnabled();
  await page.getByRole('tab', { name: 'Console' }).click();
  const consoleRegion = page.getByRole('region', { name: 'Console出力' });
  await expect(consoleRegion.getByText('log', { exact: true })).toBeVisible();
  await expect(consoleRegion.getByText('hello', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: '画面' }).click();
  await expect(
    previewFrame(page).getByRole('heading', { name: 'JavaScriptで文字を変えました' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '判定する' }).click();
  const resultDialog = page.getByRole('dialog', { name: '判定結果' });
  await expect(resultDialog.getByRole('heading', { name: 'できました' })).toBeVisible();
  await resultDialog.getByRole('button', { name: '閉じる' }).click();

  const reset = page.getByRole('button', { name: '最初に戻す', exact: true });
  await reset.click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect.poll(() => editorText(page)).toBe(JAVASCRIPT_STARTER_SOURCE);
  await page.getByRole('tab', { name: 'Console' }).click();
  await expect(
    consoleRegion.getByText('まだConsole出力はありません', { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect.poll(() => editorText(page)).toBe(JAVASCRIPT_STARTER_SOURCE);
  await page.getByRole('tab', { name: 'Console' }).click();
  await expect(
    consoleRegion.getByText('まだConsole出力はありません', { exact: true }),
  ).toBeVisible();
});

test('下書きとReview復帰を保ち、確認後のResetで3 FileをStarterへ戻す', async ({ page }) => {
  const incompleteSource = "document.querySelector('#message').textContent = 'まだ途中です';";
  await replaceAndSave(page, incompleteSource);
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (candidate) => candidate['workspaceId'] === JAVASCRIPT_EXERCISE_ID,
      );
      const files = draft?.['files'];
      return typeof files === 'object' && files !== null
        ? (files as Readonly<Record<string, unknown>>)['script.js']
        : undefined;
    })
    .toBe(incompleteSource);

  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩' })).toBeVisible({ timeout: 15_000 });
  await page
    .getByRole('button', { name: '関連スライドを見直す：script.jsで題名の文字を変更する' })
    .click();
  await expect(page.getByRole('dialog', { name: /関連スライド/u })).toBeVisible();
  await page.getByRole('button', { name: '演習へ戻る' }).click();
  await expect.poll(() => editorText(page)).toBe(incompleteSource);

  const reset = page.getByRole('button', { name: '最初に戻す', exact: true });
  await reset.click();
  const dialog = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '最初のコードに戻す', exact: true }).click();
  await expect.poll(() => editorText(page)).toBe(JAVASCRIPT_STARTER_SOURCE);
  await expect(reset).toBeDisabled();
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (candidate) => candidate['workspaceId'] === JAVASCRIPT_EXERCISE_ID,
      );
      const files = draft?.['files'];
      return typeof files === 'object' && files !== null
        ? (files as Readonly<Record<string, unknown>>)['script.js']
        : undefined;
    })
    .toBe(JAVASCRIPT_STARTER_SOURCE);

  await page.reload();
  await expect(page.getByRole('tab', { name: 'script.js', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 15_000 },
  );
  await expect.poll(() => editorText(page)).toBe(JAVASCRIPT_STARTER_SOURCE);
});
