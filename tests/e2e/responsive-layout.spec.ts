import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  exerciseRoute,
  openEditableExercise,
} from './helpers/releaseCourse';

interface Rectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Locatorの境界を比較しやすいleft/top/right/bottomへ変換する。 */
async function rectangle(locator: Locator): Promise<Rectangle> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('表示要素の境界を取得できませんでした');
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
}

/** 2つの矩形が面積を持って重ならないことを確認する。 */
function expectNoOverlap(left: Rectangle, right: Rectangle): void {
  const overlaps =
    Math.min(left.right, right.right) > Math.max(left.left, right.left) &&
    Math.min(left.bottom, right.bottom) > Math.max(left.top, right.top);
  expect(overlaps, `rectangles overlap: ${JSON.stringify({ left, right })}`).toBe(false);
}

/** Documentがviewport右端を越えず、対象をscroll後に画面内へ収められることを確認する。 */
async function expectContained(
  page: Page,
  locator: Locator,
  width: number,
  height: number,
  checkVertical = true,
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const target = await rectangle(locator);
  expect(target.left).toBeGreaterThanOrEqual(-0.5);
  expect(target.right).toBeLessThanOrEqual(width + 0.5);
  if (checkVertical) {
    expect(target.top).toBeGreaterThanOrEqual(-0.5);
    expect(target.bottom).toBeLessThanOrEqual(height + 0.5);
  }
  const root = await page.locator('html').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
}

for (const viewport of [
  { name: 'desktop-wide', width: 1440, height: 900 },
  { name: 'desktop-compact', width: 1280, height: 720 },
] as const) {
  test(`${viewport.name}でEditor、Preview、CTAが重ならず横幅へ収まる`, async ({ page }) => {
    await openEditableExercise(
      page,
      STANDARD_LESSON_ID,
      STANDARD_EXERCISE_ID,
      STANDARD_EXERCISE_TITLE,
    );
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const editor = page.getByTestId('code-workspace');
    const preview = page.getByTestId('runtime-preview-frame');
    const validate = page.getByRole('button', { name: '判定する' });
    await expect(editor).toBeVisible();
    await expect(preview).toBeVisible();
    expectNoOverlap(await rectangle(editor), await rectangle(preview));
    await expectContained(page, validate, viewport.width, viewport.height);
    await expectContained(
      page,
      page.getByTestId('runtime-preview-scroll'),
      viewport.width,
      viewport.height,
    );
  });
}

for (const viewport of [
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'mobile-portrait', width: 390, height: 844 },
] as const) {
  test(`${viewport.name}ではEditorなしでPC案内、Course、Slide、Progressが境界内に収まる`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID));
    const guide = page.getByRole('heading', { level: 1, name: 'PCで演習を開く' });
    await expect(guide).toBeVisible();
    await expect(page.getByTestId('code-workspace')).toHaveCount(0);
    await expectContained(page, guide, viewport.width, viewport.height);

    await page.goto('./#/courses/html-css');
    const courseProgress = page.getByRole('progressbar', { name: 'コース進捗' });
    await expect(courseProgress).toBeVisible();
    await expectContained(page, courseProgress, viewport.width, viewport.height);

    await page.goto('./#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01');
    const slideCard = page.locator('[data-slide-card]');
    const slideProgress = page.getByRole('progressbar', { name: 'スライドの現在位置' });
    await expect(slideCard).toBeVisible();
    await expectContained(page, slideProgress, viewport.width, viewport.height);
    await expectContained(page, slideCard, viewport.width, viewport.height, false);
  });
}

for (const reflow of [
  { name: '200%相当', width: 640 },
  { name: '400%相当', width: 320 },
] as const) {
  test(`${reflow.name}のreflowでも横スクロールを発生させない`, async ({ page }) => {
    await page.setViewportSize({ width: reflow.width, height: 800 });
    for (const path of [
      './#/',
      './#/courses/html-css',
      './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01',
    ]) {
      await page.goto(path);
      const root = await page.locator('html').evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(root.scrollWidth, path).toBeLessThanOrEqual(root.clientWidth);
    }
  });
}
