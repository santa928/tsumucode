import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  JAVASCRIPT_EXERCISE_TITLE,
  javascriptExerciseRoute,
  openEditableJavaScriptExercise,
} from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

/** JavaScript学習画面について、critical／seriousのaxe違反がないことを確認する。 */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('[data-testid="runtime-preview-frame"]')
    .analyze();
  expect(
    result.violations
      .filter(({ impact }) => impact === 'critical' || impact === 'serious')
      .map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target),
      })),
  ).toEqual([]);
}

/** Pointerを使わず指定Tab順で対象へ到達し、Enterで操作する。 */
async function activateWithKeyboard(
  page: Page,
  target: Locator,
  direction: 'Tab' | 'Shift+Tab' = 'Tab',
): Promise<void> {
  for (let index = 0; index < 120; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      await page.keyboard.press('Enter');
      return;
    }
    const editorOwnsFocus = await page.evaluate(
      () => document.activeElement?.closest('.cm-editor') !== null,
    );
    if (editorOwnsFocus) await page.keyboard.press('Escape');
    await page.keyboard.press(direction);
  }
  throw new Error('120回Tabしても対象へ到達できませんでした');
}

/** DocumentとStageの実寸を読み、固定学習ShellのScroll境界を返す。 */
async function readScrollMetrics(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const stage = document.querySelector<HTMLElement>('[data-testid="learning-stage"]');
    if (stage === null) throw new Error('learning-stageがありません');
    return {
      document: {
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
      },
      stage: {
        clientHeight: stage.clientHeight,
        scrollHeight: stage.scrollHeight,
        clientWidth: stage.clientWidth,
        scrollWidth: stage.scrollWidth,
        overflowY: getComputedStyle(stage).overflowY,
      },
    };
  });
}

test('JavaScript Exerciseの初期・Error・Hint・Reset状態に重大なaxe違反がない', async ({ page }) => {
  await openEditableJavaScriptExercise(page);
  await expectNoSeriousAxeViolations(page);

  const syntaxError = "document.querySelector('#message').textContent = '閉じていません;";
  await replaceEditorText(page, syntaxError);
  await waitForStoredDraftContent(page, syntaxError);
  await page.getByRole('button', { name: '判定する' }).click();
  const feedback = page.getByRole('dialog', { name: '判定結果' });
  await expect(feedback.getByRole('heading', { name: 'コードを確認しよう' })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await feedback.getByRole('button', { name: 'コードを直す' }).click();

  const hintTrigger = page.getByRole('button', { name: 'ヒントを見る' });
  await hintTrigger.click();
  const hint = page.getByRole('dialog', { name: 'ヒント' });
  await expect(hint).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(hintTrigger).toBeFocused();

  const resetTrigger = page.getByRole('button', { name: '最初に戻す', exact: true });
  await resetTrigger.click();
  const reset = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await expect(reset).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(resetTrigger).toBeFocused();
});

test('KeyboardだけでJavaScriptのFile tab・Editor・Error・Hint・Resetを操作できる', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openEditableJavaScriptExercise(page);
  const scriptTab = page.getByRole('tab', { name: 'script.js', exact: true });
  await activateWithKeyboard(page, scriptTab);
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'index.html', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(scriptTab).toBeFocused();
  await expect(scriptTab).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Tab');
  const editor = page.locator('.cm-content');
  await expect(editor).toBeFocused();
  const syntaxError = "document.querySelector('#message').textContent = 'Keyboard Error;";
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(syntaxError);
  await expect.poll(() => editorText(page)).toBe(syntaxError);
  await waitForStoredDraftContent(page, syntaxError);

  await page.keyboard.press('Escape');
  const validate = page.getByRole('button', { name: '判定する' });
  await activateWithKeyboard(page, validate);
  const feedback = page.getByRole('dialog', { name: '判定結果' });
  await expect(feedback.getByRole('list', { name: '確認するコード診断' })).toContainText(
    'script.js',
  );
  await activateWithKeyboard(page, feedback.getByRole('button', { name: 'コードを直す' }));
  await expect(editor).toBeFocused();

  await page.keyboard.press('Escape');
  const hintTrigger = page.getByRole('button', { name: 'ヒントを見る' });
  await activateWithKeyboard(page, hintTrigger);
  const hint = page.getByRole('dialog', { name: 'ヒント' });
  await expect(hint).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hintTrigger).toBeFocused();

  const resetTrigger = page.getByRole('button', { name: '最初に戻す', exact: true });
  await activateWithKeyboard(page, resetTrigger, 'Shift+Tab');
  const reset = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await expect(reset).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(resetTrigger).toBeFocused();
});

test('1280x720のJavaScript ExerciseをDocument Scrollなしで操作できる', async ({ page }) => {
  await openEditableJavaScriptExercise(page);
  await expect(
    page.getByRole('heading', { level: 1, name: JAVASCRIPT_EXERCISE_TITLE }),
  ).toBeVisible();
  const metrics = await readScrollMetrics(page);
  expect(metrics.document.scrollWidth).toBeLessThanOrEqual(metrics.document.clientWidth);
  expect(metrics.document.scrollHeight).toBeLessThanOrEqual(metrics.document.clientHeight + 1);
  expect(metrics.stage.scrollWidth).toBeLessThanOrEqual(metrics.stage.clientWidth + 1);
});

test('390x844ではDocumentを固定し、JavaScript SlideのStageだけを救済Scrollできる', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    './#/courses/javascript/lessons/javascript-ch00-l01/slides/javascript-ch00-l01-s04',
  );
  await expect(page.getByTestId('slide-stage')).toBeVisible();
  const metrics = await readScrollMetrics(page);
  expect(metrics.document.scrollWidth).toBeLessThanOrEqual(metrics.document.clientWidth);
  expect(metrics.document.scrollHeight).toBeLessThanOrEqual(metrics.document.clientHeight + 1);
  expect(metrics.stage.scrollWidth).toBeLessThanOrEqual(metrics.stage.clientWidth + 1);
  expect(metrics.stage.scrollHeight).toBeGreaterThan(metrics.stage.clientHeight);
  expect(metrics.stage.overflowY).toBe('auto');
  await expectNoSeriousAxeViolations(page);

  await page.goto(javascriptExerciseRoute());
  await expect(page.getByRole('heading', { level: 1, name: 'PCで演習を開く' })).toBeVisible();
  await expect(page.getByTestId('code-workspace')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page);
});
