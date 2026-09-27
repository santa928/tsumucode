import { expect, type Page } from '@playwright/test';

/** 著者順SlideのScroll境界と本文末尾・Pagerへの到達を確認し、先頭へ戻す。 */
export async function expectSlideScrollReachable(page: Page, narrow: boolean): Promise<void> {
  const stage = page.getByTestId('learning-stage');
  const shell = page.locator('.tc-learning-viewport-shell');
  const scrollOwner = narrow ? shell : stage;
  await expect(stage).toHaveCSS('overflow-y', narrow ? 'visible' : 'auto');
  if (narrow) await expect(shell).toHaveCSS('overflow-y', 'auto');
  for (const region of [shell, stage, page.getByTestId('slide-stage')]) {
    const size = await region.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1);
  }
  await scrollOwner.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const end = await page
    .getByTestId('slide-stage')
    .locator('.tc-slide-blocks > *')
    .last()
    .boundingBox();
  const owner = await scrollOwner.boundingBox();
  if (end === null || owner === null) throw new Error('本文末尾またはScroll領域がありません');
  expect(end.y + end.height).toBeLessThanOrEqual(owner.y + owner.height + 1);
  expect(end.y + end.height).toBeGreaterThan(owner.y);
  // scrollTopは整数へ丸められるため、既存レイアウト検証と同じ1 CSS pxで境界を比較する。
  const pager = await page.locator('.tc-learning-shell-pager').boundingBox();
  const viewport = page.viewportSize();
  if (pager === null || viewport === null) throw new Error('PagerまたはViewportがありません');
  expect(pager.y).toBeGreaterThanOrEqual(-1);
  expect(pager.y + pager.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(pager.x).toBeGreaterThanOrEqual(-1);
  expect(pager.x + pager.width).toBeLessThanOrEqual(viewport.width + 1);
  const root = await page.locator('html').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    scrollTop: element.scrollTop,
  }));
  expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
  expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  expect(root.scrollTop).toBe(0);
  await scrollOwner.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page.getByTestId('slide-stage').getByRole('heading', { level: 1 })).toBeInViewport();
}
