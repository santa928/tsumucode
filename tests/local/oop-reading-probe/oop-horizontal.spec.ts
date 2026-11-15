import { expect, test } from '@playwright/test';
import { testBasePath } from '../../e2e/helpers/testBasePath';

test('the fixed narrow OOP example can be scrolled to its last code column', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${testBasePath()}#/courses/python-oop/lessons/python-oop-ch03-l01/slides/python-oop-ch03-l01-s01`,
  );
  await expect(page.getByTestId('slide-stage')).toHaveAttribute(
    'data-slide-id',
    'python-oop-ch03-l01-s01',
  );
  const code = page.locator('.tc-slide-code pre').first();
  await expect(code).toContainText('return function(value) * 2');
  await code.scrollIntoViewIfNeeded();
  const before = await code.evaluate((node) => ({
    left: node.scrollLeft,
    maximum: node.scrollWidth - node.clientWidth,
    overflow: getComputedStyle(node).overflowX,
  }));
  expect(before.overflow).toBe('auto');
  expect(before.left).toBe(0);
  expect(before.maximum).toBeGreaterThan(0);
  await code.hover();
  await page.mouse.wheel(1200, 0);
  await expect.poll(() => code.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await expect
    .poll(() => code.evaluate((node) => node.scrollLeft))
    .toBeGreaterThanOrEqual(before.maximum - 1);
});
