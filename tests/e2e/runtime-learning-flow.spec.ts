import { expect, test } from '@playwright/test';
import {
  RUNTIME_EXERCISE_PATH,
  editorText,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import { testBasePath } from './helpers/testBasePath';

const COURSE_PATH = `${testBasePath()}#/courses/html-css`;
const COMPLETION_PATH = `${RUNTIME_EXERCISE_PATH}/completion`;
const SLIDE_PATH = `${testBasePath()}#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s04`;
const SOLUTION_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>最初のWebページ</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="learning-note">
      <h1>わたしの学習ノート</h1>
      <p>HTMLは内容、CSSは見た目を受け持ちます。</p>
    </main>
  </body>
</html>`;
const SOLUTION_CSS = `body {
  margin: 0;
  min-height: 100vh;
  background-color: #fffaf0;
  color: #19352d;
  font-family: system-ui, sans-serif;
}

.learning-note {
  max-width: 42rem;
  margin: 0 auto;
  padding: 4rem 2rem;
}`;

/** 現行の最初の演習をHTML/CSSの2 fileとも合格状態へ編集する。 */
async function completeFirstExercise(page: Parameters<typeof editorText>[0]): Promise<void> {
  await page.getByRole('tab', { name: 'index.html' }).click();
  await replaceEditorText(page, SOLUTION_HTML);
  await waitForStoredDraftContent(page, SOLUTION_HTML);
  await page.getByRole('tab', { name: 'styles.css' }).click();
  await replaceEditorText(page, SOLUTION_CSS);
  await waitForStoredDraftContent(page, SOLUTION_CSS);
}

test.beforeEach(async ({ page }) => {
  await observeRuntimePage(page);
});

test.afterEach(async ({ page }) => {
  await expect(readRuntimeErrors(page)).resolves.toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
});

test('関連SlideをOverlayで見直し、Editor内容とFocusを維持する', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(RUNTIME_EXERCISE_PATH);
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await replaceEditorText(page, '<main><p>見直し前の途中</p></main>');
  await page.getByRole('button', { name: '判定する' }).click();
  await page
    .getByRole('button', {
      name: '関連スライドを見直す：h1の内容を学習ノートへ変える',
    })
    .click();

  await expect(page.getByRole('dialog', { name: /関連スライド/u })).toBeVisible();
  await page.getByRole('button', { name: '演習へ戻る' }).click();

  await expect.poll(() => editorText(page)).toContain('見直し前の途中');
  await expect(page.locator('.cm-content')).toBeFocused();
});

test('SlideからHintと見直しを経て完了し、Course Mapへ進捗を反映する', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${testBasePath()}#/`);
  await page.getByRole('link', { name: 'HTML/CSS はじめの一歩：最初のピースを置く' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Webページは3つの役割でできている' }),
  ).toBeVisible();
  await page.getByRole('link', { name: '次のスライドへ →' }).click();
  await page.getByRole('link', { name: '次のスライドへ →' }).click();
  await page.getByRole('link', { name: '次のスライドへ →' }).click();
  await page
    .getByRole('link', { name: '「内容と見た目を1箇所ずつ変える」のコード演習を始める' })
    .click();
  await expect(page.getByTestId('code-workspace')).toBeVisible();

  await replaceEditorText(page, '<main><p>見出しはまだ</p></main>');
  await waitForStoredDraftContent(page, '<main><p>見出しはまだ</p></main>');
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByText('あと一歩')).toBeVisible();

  // このFeedbackが指すRuleのhintIdはlevel 2だが、開示は必ずlevel 1から始める。
  await page
    .getByRole('button', { name: '次のヒントを見る：h1の内容を学習ノートへ変える' })
    .click();
  const hintRegion = page.getByRole('region', { name: 'ヒント' });
  await expect(hintRegion).toContainText('観察ポイント');
  await expect(hintRegion).toContainText('Previewの見出しを見る');
  await expect(hintRegion.locator('summary', { hasText: '考え方' })).toHaveCount(0);
  await page.getByRole('button', { name: 'ヒント2を見る：考え方' }).click();
  await expect(hintRegion.locator('summary', { hasText: '考え方' })).toHaveCount(1);
  await expect(hintRegion).toContainText('HTMLのh1を探す');
  await page.getByRole('button', { name: '閉じる' }).click();
  const feedbackTrigger = page.getByRole('button', { name: '判定結果を見る' });
  await feedbackTrigger.click();
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(feedbackTrigger).toBeFocused();
  await feedbackTrigger.click();

  const reviewButton = page.getByRole('button', {
    name: '関連スライドを見直す：h1の内容を学習ノートへ変える',
  });
  await reviewButton.click();
  await expect(page.getByRole('dialog', { name: /関連スライド/u })).toBeVisible();
  await page.getByRole('button', { name: '演習へ戻る' }).click();
  await expect.poll(() => editorText(page)).toContain('見出しはまだ');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await completeFirstExercise(page);
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByTestId('learning-completion')).toContainText('ピースがはまりました');
  await page.getByRole('link', { name: 'コースマップへ戻る' }).click();
  await expect(page.getByRole('progressbar', { name: 'コース進捗' })).toHaveAttribute('value', '1');
});

test('pass後の再編集でCompletionとMobile完成Previewを無効化し、再passで復帰する', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(SLIDE_PATH);
  await page
    .getByRole('link', { name: '「内容と見た目を1箇所ずつ変える」のコード演習を始める' })
    .click();
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await completeFirstExercise(page);
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await replaceEditorText(page, '<main><p>再編集中</p></main>');
  await waitForStoredDraftContent(page, '<main><p>再編集中</p></main>');
  await page.goto(COMPLETION_PATH);
  await expect(page.getByTestId('learning-completion')).toHaveCount(0);
  await expect(page.getByTestId('code-workspace')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'PCで演習を開く' })).toBeVisible();
  await expect(page.getByText(/完成Preview/u)).toHaveCount(0);
  await expect(page.getByTestId('code-workspace')).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await completeFirstExercise(page);
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible();
});

test('MobileではSlideと進捗を読めるがEditorを配信しない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SLIDE_PATH);
  await expect(
    page.getByRole('heading', { level: 1, name: '直したいものからFileを選ぶ' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '演習はPCで積み上げよう' })).toBeVisible();
  await page.goto(RUNTIME_EXERCISE_PATH);
  await expect(page.getByRole('heading', { level: 1, name: 'PCで演習を開く' })).toBeVisible();
  await expect(page.getByTestId('code-workspace')).toHaveCount(0);
  await page.goto(COURSE_PATH);
  await expect(page.getByRole('progressbar', { name: 'コース進捗' })).toBeVisible();
});
