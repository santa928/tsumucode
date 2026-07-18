import { expect, test } from '@playwright/test';

test('独立制作と非提携Noticeへ全画面から到達できる', async ({ page }) => {
  const routes = [
    './#/',
    './#/courses/html-css',
    './#/courses/html-css/lessons/html-css-ch01-l01/slides/html-css-ch01-l01-s01',
    './#/courses/html-css/lessons/html-css-ch01-l01/exercises/html-css-ch01-l01-e01',
  ] as const;

  for (const route of routes) {
    await page.goto(route);
    const notice = page.getByRole('contentinfo');
    await expect(notice, route).toContainText('Progateとは提携・関連していません');
    await expect(notice, route).toContainText('教材・課題・UIは独自制作です');
  }
});
