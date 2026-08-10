import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  JAVASCRIPT_EXERCISE_TITLE,
  javascriptExerciseRoute,
  openEditableJavaScriptExercise,
  type JavaScriptExerciseLocation,
} from './helpers/javascriptCourse';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

/** JavaScript学習画面について、critical／seriousのaxe違反がないことを確認する。 */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('[data-testid="runtime-preview-frame"] iframe')
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

/** Pointerを使わずTab順で入力対象へ到達し、内容を変更せずFocusだけを置く。 */
async function focusWithKeyboard(
  page: Page,
  target: Locator,
  direction: 'Tab' | 'Shift+Tab' = 'Tab',
): Promise<void> {
  const focusHistory: string[] = [];
  for (let index = 0; index < 120; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    focusHistory.push(
      await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return active?.tagName ?? 'null';
        return [
          active.tagName,
          active.getAttribute('role'),
          active.getAttribute('aria-label'),
          active.className,
        ]
          .filter(Boolean)
          .join('|');
      }),
    );
    await page.keyboard.press(direction);
  }
  throw new Error(
    `120回Tabしても入力対象へ到達できませんでした: ${focusHistory.slice(-24).join(' -> ')}`,
  );
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

const CHAPTER_ONE_FIRST_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch01-l01',
  exerciseId: 'javascript-ch01-l01-e01',
  title: '3種類の値をConsoleへ表示する',
};

const CHAPTER_TWO_LOOP_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch02-l04',
  exerciseId: 'javascript-ch02-l04-e01',
  title: 'forで問題1から問題3まで表示する',
};

const CHAPTER_THREE_CLOSURE_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch03-l05',
  exerciseId: 'javascript-ch03-l05-e01',
  title: 'Closureで得点を10ずつ増やす',
};

const CHAPTER_FOUR_DESTRUCTURING_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch04-l05',
  exerciseId: 'javascript-ch04-l05-e01',
  title: 'ObjectとArrayをDestructuringする',
};

const CHAPTER_FIVE_IMMUTABLE_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch05-l04',
  exerciseId: 'javascript-ch05-l04-e01',
  title: '回答済みの新しいArrayを作る',
};

const CHAPTER_SIX_MODULE_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch06-l01',
  exerciseId: 'javascript-ch06-l01-e01',
  title: '問題Arrayをexportする',
};

test('JavaScript Exerciseの初期・Error・Hint・Reset状態に重大なaxe違反がない', async ({ page }) => {
  await openEditableJavaScriptExercise(page);
  await expectNoSeriousAxeViolations(page);
  await page.getByRole('tab', { name: 'Console' }).click();
  await expect(page.getByRole('region', { name: 'Console出力' })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await page.getByRole('tab', { name: '画面' }).click();

  const syntaxError = "document.querySelector('#message').textContent = '閉じていません;";
  await replaceEditorText(page, syntaxError);
  await waitForStoredDraftContent(page, syntaxError);
  await page.getByRole('button', { name: '判定する' }).click();
  const feedback = page.getByRole('dialog', { name: '判定結果' });
  await expect(feedback.getByRole('heading', { name: 'コードを確認しよう' })).toBeVisible();
  await expect(feedback.getByRole('status', { name: '判定結果' })).toHaveAttribute(
    'aria-live',
    'polite',
  );
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

  const previewTab = page.getByRole('tab', { name: '画面' });
  const consoleTab = page.getByRole('tab', { name: 'Console' });
  await activateWithKeyboard(page, previewTab);
  await page.keyboard.press('ArrowRight');
  await expect(consoleTab).toBeFocused();
  await expect(consoleTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Console出力' })).toBeVisible();
  const focusIndicator = await consoleTab.evaluate((element) => {
    const style = getComputedStyle(element);
    return { boxShadow: style.boxShadow, outlineStyle: style.outlineStyle };
  });
  expect(
    focusIndicator.boxShadow !== 'none' || focusIndicator.outlineStyle !== 'none',
    `Console tabに視認できるFocus表示がありません: ${JSON.stringify(focusIndicator)}`,
  ).toBe(true);
  await page.keyboard.press('ArrowLeft');
  await expect(previewTab).toBeFocused();
  await expect(previewTab).toHaveAttribute('aria-selected', 'true');

  const editor = page.locator('.cm-content');
  await focusWithKeyboard(page, editor, 'Shift+Tab');
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
  await expect(validate).toBeEnabled();
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

test('1280x720のJavaScript ExerciseをDocument Scrollなしで操作できる', async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditableJavaScriptExercise(page);
  await expect(
    page.getByRole('heading', { level: 1, name: JAVASCRIPT_EXERCISE_TITLE }),
  ).toBeVisible();
  const metrics = await readScrollMetrics(page);
  expect(metrics.document.scrollWidth).toBeLessThanOrEqual(metrics.document.clientWidth);
  expect(metrics.document.scrollHeight).toBeLessThanOrEqual(metrics.document.clientHeight + 1);
  expect(metrics.stage.scrollWidth).toBeLessThanOrEqual(metrics.stage.clientWidth + 1);
  await page.screenshot({ path: testInfo.outputPath('javascript-exercise-1280x720.png') });
});

test('390x844ではDocumentを固定し、JavaScript SlideのStageだけを救済Scrollできる', async ({
  page,
}, testInfo: TestInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath('javascript-slide-390x844.png') });

  await page.goto(javascriptExerciseRoute());
  await expect(page.getByRole('heading', { level: 1, name: 'PCで演習を開く' })).toBeVisible();
  await expect(page.getByTestId('code-workspace')).toHaveCount(0);
  await expectNoSeriousAxeViolations(page);
  await page.screenshot({ path: testInfo.outputPath('javascript-exercise-notice-390x844.png') });
});

test('768x1024ではDocumentを固定し、JavaScript ExerciseをPC案内へ安全に切り替える', async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(javascriptExerciseRoute());
  await expect(page.getByRole('heading', { level: 1, name: 'PCで演習を開く' })).toBeVisible();
  await expect(page.getByTestId('code-workspace')).toHaveCount(0);
  const documentMetrics = await page.locator('html').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(documentMetrics.scrollWidth).toBeLessThanOrEqual(documentMetrics.clientWidth);
  expect(documentMetrics.scrollHeight).toBeLessThanOrEqual(documentMetrics.clientHeight + 1);
  await expectNoSeriousAxeViolations(page);
  await page.screenshot({ path: testInfo.outputPath('javascript-exercise-notice-768x1024.png') });
});

test('Chapter 01のExerciseと実習直前Slideを代表2 viewportで安全に表示する', async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditableJavaScriptExercise(page, CHAPTER_ONE_FIRST_EXERCISE);
  await expectNoSeriousAxeViolations(page);
  const exerciseMetrics = await readScrollMetrics(page);
  expect(exerciseMetrics.document.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.document.clientWidth,
  );
  expect(exerciseMetrics.document.scrollHeight).toBeLessThanOrEqual(
    exerciseMetrics.document.clientHeight + 1,
  );
  expect(exerciseMetrics.stage.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.stage.clientWidth + 1,
  );
  await page.screenshot({ path: testInfo.outputPath('javascript-ch01-exercise-1280x720.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${testBasePath()}#/courses/javascript/lessons/javascript-ch01-l01/slides/javascript-ch01-l01-s04`,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '3種類の値を順番どおりに書く' }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  const slideMetrics = await readScrollMetrics(page);
  expect(slideMetrics.document.scrollWidth).toBeLessThanOrEqual(slideMetrics.document.clientWidth);
  expect(slideMetrics.document.scrollHeight).toBeLessThanOrEqual(
    slideMetrics.document.clientHeight + 1,
  );
  expect(slideMetrics.stage.scrollWidth).toBeLessThanOrEqual(slideMetrics.stage.clientWidth + 1);
  expect(slideMetrics.stage.overflowY).toBe('auto');
  await page.screenshot({ path: testInfo.outputPath('javascript-ch01-slide-390x844.png') });
});

test('Chapter 02のExerciseと実習直前Slideを代表2 viewportで安全に表示する', async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditableJavaScriptExercise(page, CHAPTER_TWO_LOOP_EXERCISE);
  await expectNoSeriousAxeViolations(page);
  const exerciseMetrics = await readScrollMetrics(page);
  expect(exerciseMetrics.document.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.document.clientWidth,
  );
  expect(exerciseMetrics.document.scrollHeight).toBeLessThanOrEqual(
    exerciseMetrics.document.clientHeight + 1,
  );
  expect(exerciseMetrics.stage.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.stage.clientWidth + 1,
  );
  await page.screenshot({ path: testInfo.outputPath('javascript-ch02-exercise-1280x720.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${testBasePath()}#/courses/javascript/lessons/javascript-ch02-l04/slides/javascript-ch02-l04-s04`,
  );
  await expect(page.getByRole('heading', { level: 1, name: '3を含む条件へ直す' })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  const slideMetrics = await readScrollMetrics(page);
  expect(slideMetrics.document.scrollWidth).toBeLessThanOrEqual(slideMetrics.document.clientWidth);
  expect(slideMetrics.document.scrollHeight).toBeLessThanOrEqual(
    slideMetrics.document.clientHeight + 1,
  );
  expect(slideMetrics.stage.scrollWidth).toBeLessThanOrEqual(slideMetrics.stage.clientWidth + 1);
  expect(slideMetrics.stage.overflowY).toBe('auto');
  await page.screenshot({ path: testInfo.outputPath('javascript-ch02-slide-390x844.png') });
});

test('Chapter 03のExerciseと実習直前Slideを代表2 viewportで安全に表示する', async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditableJavaScriptExercise(page, CHAPTER_THREE_CLOSURE_EXERCISE);
  await expectNoSeriousAxeViolations(page);
  const exerciseMetrics = await readScrollMetrics(page);
  expect(exerciseMetrics.document.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.document.clientWidth,
  );
  expect(exerciseMetrics.document.scrollHeight).toBeLessThanOrEqual(
    exerciseMetrics.document.clientHeight + 1,
  );
  expect(exerciseMetrics.stage.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.stage.clientWidth + 1,
  );
  await page.screenshot({ path: testInfo.outputPath('javascript-ch03-exercise-1280x720.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${testBasePath()}#/courses/javascript/lessons/javascript-ch03-l05/slides/javascript-ch03-l05-s04`,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '2回の呼び出しで10から20へ進める' }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  const slideMetrics = await readScrollMetrics(page);
  expect(slideMetrics.document.scrollWidth).toBeLessThanOrEqual(slideMetrics.document.clientWidth);
  expect(slideMetrics.document.scrollHeight).toBeLessThanOrEqual(
    slideMetrics.document.clientHeight + 1,
  );
  expect(slideMetrics.stage.scrollWidth).toBeLessThanOrEqual(slideMetrics.stage.clientWidth + 1);
  expect(slideMetrics.stage.overflowY).toBe('auto');
  await page.screenshot({ path: testInfo.outputPath('javascript-ch03-slide-390x844.png') });
});

test('Chapter 04のExerciseと実習直前Slideを代表2 viewportで安全に表示する', async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditableJavaScriptExercise(page, CHAPTER_FOUR_DESTRUCTURING_EXERCISE);
  await expectNoSeriousAxeViolations(page);
  const exerciseMetrics = await readScrollMetrics(page);
  expect(exerciseMetrics.document.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.document.clientWidth,
  );
  expect(exerciseMetrics.document.scrollHeight).toBeLessThanOrEqual(
    exerciseMetrics.document.clientHeight + 1,
  );
  expect(exerciseMetrics.stage.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.stage.clientWidth + 1,
  );
  await page.screenshot({ path: testInfo.outputPath('javascript-ch04-exercise-1280x720.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${testBasePath()}#/courses/javascript/lessons/javascript-ch04-l05/slides/javascript-ch04-l05-s04`,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'ObjectとArrayを2段階で分ける' }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  const slideMetrics = await readScrollMetrics(page);
  expect(slideMetrics.document.scrollWidth).toBeLessThanOrEqual(slideMetrics.document.clientWidth);
  expect(slideMetrics.document.scrollHeight).toBeLessThanOrEqual(
    slideMetrics.document.clientHeight + 1,
  );
  expect(slideMetrics.stage.scrollWidth).toBeLessThanOrEqual(slideMetrics.stage.clientWidth + 1);
  expect(slideMetrics.stage.overflowY).toBe('auto');
  await page.screenshot({ path: testInfo.outputPath('javascript-ch04-slide-390x844.png') });
});

test('Chapter 05のExerciseと実習直前Slideを代表2 viewportで安全に表示する', async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditableJavaScriptExercise(page, CHAPTER_FIVE_IMMUTABLE_EXERCISE);
  await expectNoSeriousAxeViolations(page);
  const exerciseMetrics = await readScrollMetrics(page);
  expect(exerciseMetrics.document.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.document.clientWidth,
  );
  expect(exerciseMetrics.document.scrollHeight).toBeLessThanOrEqual(
    exerciseMetrics.document.clientHeight + 1,
  );
  expect(exerciseMetrics.stage.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.stage.clientWidth + 1,
  );
  await page.screenshot({ path: testInfo.outputPath('javascript-ch05-exercise-1280x720.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${testBasePath()}#/courses/javascript/lessons/javascript-ch05-l04/slides/javascript-ch05-l04-s04`,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '回答前と回答後を両方確かめる' }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  const slideMetrics = await readScrollMetrics(page);
  expect(slideMetrics.document.scrollWidth).toBeLessThanOrEqual(slideMetrics.document.clientWidth);
  expect(slideMetrics.document.scrollHeight).toBeLessThanOrEqual(
    slideMetrics.document.clientHeight + 1,
  );
  expect(slideMetrics.stage.scrollWidth).toBeLessThanOrEqual(slideMetrics.stage.clientWidth + 1);
  expect(slideMetrics.stage.overflowY).toBe('auto');
  await page.screenshot({ path: testInfo.outputPath('javascript-ch05-slide-390x844.png') });
});

test('Chapter 06のModule ExerciseとDebug直前Slideを代表2 viewportで安全に表示する', async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditableJavaScriptExercise(page, CHAPTER_SIX_MODULE_EXERCISE);
  await expect(page.getByRole('tab', { name: 'main.js', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'questions.js', exact: true })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  const exerciseMetrics = await readScrollMetrics(page);
  expect(exerciseMetrics.document.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.document.clientWidth,
  );
  expect(exerciseMetrics.document.scrollHeight).toBeLessThanOrEqual(
    exerciseMetrics.document.clientHeight + 1,
  );
  expect(exerciseMetrics.stage.scrollWidth).toBeLessThanOrEqual(
    exerciseMetrics.stage.clientWidth + 1,
  );
  await page.screenshot({ path: testInfo.outputPath('javascript-ch06-exercise-1280x720.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${testBasePath()}#/courses/javascript/lessons/javascript-ch06-l04/slides/javascript-ch06-l04-s04`,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '問題数を直して30点へそろえる' }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  const slideMetrics = await readScrollMetrics(page);
  expect(slideMetrics.document.scrollWidth).toBeLessThanOrEqual(slideMetrics.document.clientWidth);
  expect(slideMetrics.document.scrollHeight).toBeLessThanOrEqual(
    slideMetrics.document.clientHeight + 1,
  );
  expect(slideMetrics.stage.scrollWidth).toBeLessThanOrEqual(slideMetrics.stage.clientWidth + 1);
  expect(slideMetrics.stage.overflowY).toBe('auto');
  await page.screenshot({ path: testInfo.outputPath('javascript-ch06-slide-390x844.png') });
});
