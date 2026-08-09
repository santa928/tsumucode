import { expect, test, type Page } from '@playwright/test';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import { testBasePath } from './helpers/testBasePath';

const CHAPTER_TWO_SLIDES = [
  ...['01', '02', '03', '04'].flatMap((lessonNumber) =>
    ['01', '02', '03', '04'].map((slideNumber) => ({
      lessonId: `javascript-ch02-l${lessonNumber}`,
      slideId: `javascript-ch02-l${lessonNumber}-s${slideNumber}`,
    })),
  ),
] as const;

/** Chapter 02のSlideを開き、固定DocumentとStage内の横幅を実寸で確認する。 */
async function expectSlideFitsViewport(
  page: Page,
  expectedSlideId: string,
  allowStageVerticalScroll: boolean,
): Promise<void> {
  const stage = page.getByTestId('learning-stage');
  await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', expectedSlideId);
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const learningStage = document.querySelector<HTMLElement>('[data-testid="learning-stage"]');
    if (learningStage === null) throw new Error('learning-stageがありません');
    return {
      document: {
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
      },
      stage: {
        clientHeight: learningStage.clientHeight,
        scrollHeight: learningStage.scrollHeight,
        clientWidth: learningStage.clientWidth,
        scrollWidth: learningStage.scrollWidth,
        overflowY: getComputedStyle(learningStage).overflowY,
      },
      codeBlocks: [...document.querySelectorAll<HTMLElement>('pre')].map((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    };
  });

  expect(metrics.document.scrollWidth).toBeLessThanOrEqual(metrics.document.clientWidth);
  expect(metrics.document.scrollHeight).toBeLessThanOrEqual(metrics.document.clientHeight + 1);
  expect(metrics.stage.scrollWidth).toBeLessThanOrEqual(metrics.stage.clientWidth + 1);
  if (allowStageVerticalScroll) {
    expect(metrics.stage.overflowY).toBe('auto');
  } else {
    expect(metrics.stage.scrollHeight).toBeLessThanOrEqual(metrics.stage.clientHeight + 1);
  }
  for (const codeBlock of metrics.codeBlocks) {
    expect(
      codeBlock.scrollWidth,
      `${page.url()} のCode Blockが横にはみ出しています: ${JSON.stringify(codeBlock)}`,
    ).toBeLessThanOrEqual(codeBlock.clientWidth + 1);
  }

  const images = page.getByTestId('slide-stage').locator('img');
  for (let index = 0; index < (await images.count()); index += 1) {
    await expect
      .poll(() =>
        images
          .nth(index)
          .evaluate((element) =>
            element instanceof HTMLImageElement && element.complete ? element.naturalWidth : 0,
          ),
      )
      .toBeGreaterThan(0);
  }
  await expect(stage).toBeVisible();
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

for (const viewport of [
  { id: 'desktop-compact', width: 1280, height: 720, allowStageVerticalScroll: false },
  { id: 'mobile-portrait', width: 390, height: 844, allowStageVerticalScroll: true },
] as const) {
  test(`Chapter 02の全16 Slideが${viewport.id}の学習領域へ収まる`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const { lessonId, slideId } of CHAPTER_TWO_SLIDES) {
      await page.goto(
        `${testBasePath()}#/courses/javascript/lessons/${lessonId}/slides/${slideId}`,
      );
      await expectSlideFitsViewport(page, slideId, viewport.allowStageVerticalScroll);
    }
  });
}
