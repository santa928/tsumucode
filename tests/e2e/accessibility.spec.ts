import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readStoredProgress } from './helpers/progress';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  exerciseRoute,
  openEditableExercise,
  readExerciseSolution,
  replaceWorkspaceFiles,
} from './helpers/releaseCourse';

const SLIDE_ROUTES = [
  './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01',
  './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s02',
  './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s03',
] as const;

const INITIAL_ROUTES = [
  { name: 'home', path: './#/', readyName: '学びたいピースを選ぶ' },
  { name: 'course-map', path: './#/courses/html-css', readyName: 'HTML/CSS はじめの一歩' },
  { name: 'slide', path: SLIDE_ROUTES[0], readyName: 'Webページは3つの役割でできている' },
  {
    name: 'exercise',
    path: exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID),
    readyName: STANDARD_EXERCISE_TITLE,
  },
] as const;

/** WCAG 2.0〜2.2のA/AA対象について、impactに関係なくaxe違反0件を確認する。 */
async function expectNoAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

/** 必須Slideを利用者と同じ「次へ」操作で読み、各閲覧記録のdurable保存を待つ。 */
async function visitRequiredSlides(page: Page): Promise<void> {
  await page.goto(SLIDE_ROUTES[0]);
  for (const [index, slideRoute] of SLIDE_ROUTES.entries()) {
    await expect(page).toHaveURL(new RegExp(slideRoute.split('#')[1] ?? '', 'u'));
    await expect(page.getByRole('progressbar', { name: 'スライドの現在位置' })).toHaveAttribute(
      'value',
      String(index + 1),
    );
    const slideId = slideRoute.split('/').at(-1);
    await expect
      .poll(async () => JSON.stringify((await readStoredProgress(page)).courses))
      .toContain(slideId);
    if (index < SLIDE_ROUTES.length - 1) {
      await page.getByRole('link', { name: '次のスライドへ →' }).click();
    }
  }
}

/** TabまたはShift+Tabだけで対象へ到達し、focus表示と非遮蔽を確認して操作する。 */
async function tabToAndActivate(
  page: Page,
  target: Locator,
  direction: 'Tab' | 'Shift+Tab' = 'Tab',
): Promise<void> {
  const focusTrail: string[] = [];
  for (let index = 0; index < 120; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      const indicator = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
      });
      expect(indicator.outlineStyle).not.toBe('none');
      expect(Number.parseFloat(indicator.outlineWidth)).toBeGreaterThan(0);
      const operable = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
        const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
        const hit = document.elementFromPoint(x, y);
        return {
          insideViewport:
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= innerWidth &&
            rect.bottom <= innerHeight,
          hitTarget: hit === element || (hit !== null && element.contains(hit)),
        };
      });
      expect(operable).toEqual({ insideViewport: true, hitTarget: true });
      await page.keyboard.press('Enter');
      return;
    }
    focusTrail.push(
      await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return active?.nodeName ?? 'null';
        return [active.tagName, active.getAttribute('aria-label'), active.textContent.trim()]
          .filter(Boolean)
          .join(':')
          .slice(0, 160);
      }),
    );
    const editorOwnsFocus = await page.evaluate(
      () => document.activeElement?.closest('.cm-editor') !== null,
    );
    if (editorOwnsFocus) await page.keyboard.press('Escape');
    await page.keyboard.press(direction);
  }
  throw new Error(
    `120回Tabしても対象へ到達できませんでした: ${JSON.stringify(focusTrail.slice(-24))}`,
  );
}

/** 表示中のnative操作要素がWCAG 2.2 AAの24 CSS px最小targetを満たすことを確認する。 */
async function expectMinimumTargetSize(page: Page): Promise<void> {
  const undersized = await page
    .locator('a, button, summary, input:not(.sr-only)')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          rect.width === 0 ||
          rect.height === 0
        )
          return [];
        return rect.width + 0.5 < 24 || rect.height + 0.5 < 24
          ? [
              {
                name:
                  element.getAttribute('aria-label') ||
                  element.textContent.trim() ||
                  element.tagName,
                width: rect.width,
                height: rect.height,
              },
            ]
          : [];
      }),
    );
  expect(undersized).toEqual([]);
}

for (const route of INITIAL_ROUTES) {
  test(`${route.name}にWCAG A/AA対象のaxe違反がない`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(route.path);
    await expect(page.getByRole('heading', { level: 1, name: route.readyName })).toBeVisible();
    await expectNoAxeViolations(page);
    await expectMinimumTargetSize(page);
  });
}

test('Exerciseのcode-error、incomplete、Hint、Review、pass、Completionにaxe違反がない', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await visitRequiredSlides(page);
  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );
  await expectNoAxeViolations(page);

  await replaceWorkspaceFiles(page, {
    'index.html': '<main>\n<div x=',
    'styles.css': 'main {\n  color:',
  });
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByRole('heading', { name: 'コードを確認しよう' })).toBeVisible();
  await expectNoAxeViolations(page);

  await replaceWorkspaceFiles(page, {
    'index.html': '<main><h1>わたしの学習ノート</h1></main>',
    'styles.css': 'body { background-color: #ffffff; }',
  });
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩' })).toBeVisible();
  await expectNoAxeViolations(page);

  await page
    .getByRole('button', { name: /次のヒントを見る/u })
    .first()
    .click();
  await expect(page.getByRole('region', { name: 'ヒント' })).toContainText('観察ポイント');
  await expectNoAxeViolations(page);

  await page
    .getByRole('button', { name: /関連スライドを見直す/u })
    .first()
    .click();
  await expect(page.getByRole('button', { name: '演習へ戻る' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: '演習へ戻る' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: STANDARD_EXERCISE_TITLE }),
  ).toBeVisible();

  await replaceWorkspaceFiles(
    page,
    await readExerciseSolution('html-css-ch00', STANDARD_LESSON_ID, STANDARD_EXERCISE_ID),
  );
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible();
  await expectNoAxeViolations(page);
});

test('Shift+Tab逆順でHomeの主要CTAへ到達し、focusが隠れず操作できる', async ({ page }) => {
  await page.goto('./#/');
  const courseCta = page.getByRole('link', {
    name: 'HTML/CSS はじめの一歩：最初のピースを置く',
  });
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  await tabToAndActivate(page, courseCta, 'Shift+Tab');
  await expect(page).toHaveURL(/html-css-ch00-l01\/slides\/html-css-ch00-l01-s01$/u);
});

test('Import差分と削除確認にaxe違反がなく、状態をaria-liveで伝える', async ({ page }, testInfo) => {
  await page.goto('./#/');
  const exportButton = page.getByRole('button', { name: '全コースの進捗を書き出す' });
  const download = page.waitForEvent('download');
  await exportButton.click();
  const bundlePath = testInfo.outputPath('a11y-progress.json');
  await (await download).saveAs(bundlePath);
  await expect(page.getByRole('status')).toContainText('書き出しました');

  await page.getByLabel('進捗Bundleを選ぶ').setInputFiles({
    name: 'progress.json',
    mimeType: 'application/json',
    buffer: await readFile(bundlePath),
  });
  await expect(page.getByRole('region', { name: '読み込み差分' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('まだ端末データは変更していません');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: '取り消す' }).click();

  await page.getByRole('button', { name: 'この端末の学習データを削除' }).click();
  await expect(page.getByRole('alert')).toContainText('進捗と下書きを削除します');
  await expectNoAxeViolations(page);
});

test('390pxのPC案内にaxe違反がなく、Editorを配信しない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID));
  await expect(page.getByRole('heading', { level: 1, name: 'PCで演習を開く' })).toBeVisible();
  await expect(page.getByTestId('code-workspace')).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('Keyboardだけで判定、見直し、復帰でき、CodeMirrorからEscapeとTabで脱出できる', async ({
  page,
}) => {
  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );
  await tabToAndActivate(page, page.getByRole('button', { name: '判定する' }));
  await expect(page.getByRole('heading', { name: 'あと一歩' })).toBeVisible();
  await tabToAndActivate(page, page.getByRole('button', { name: /関連スライドを見直す/u }).first());
  await expect(page).toHaveURL(/\/review\//u);
  await tabToAndActivate(page, page.getByRole('button', { name: '演習へ戻る' }));
  await expect(page.getByTestId('code-workspace')).toBeVisible();

  const editor = page.locator('.cm-content');
  await editor.focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('.cm-editor') === null))
    .toBe(true);
});

test('Reduced MotionではCompletionの最終状態をanimation待ちなしで表示する', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visitRequiredSlides(page);
  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );
  await replaceWorkspaceFiles(
    page,
    await readExerciseSolution('html-css-ch00', STANDARD_LESSON_ID, STANDARD_EXERCISE_ID),
  );
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByTestId('learning-completion')).toContainText('ピースがはまりました');
  await expect(page.getByRole('progressbar', { name: 'レッスンの完成' })).toHaveAttribute(
    'value',
    '1',
  );
});
