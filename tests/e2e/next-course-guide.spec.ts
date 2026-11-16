import { expect, test } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';

test('Nextの入口に必要な前提と実習環境を表示する', async ({ page }) => {
  const title = 'Next.js 実サーバーの第一歩';
  const before =
    'TypeScriptの型と、Reactの部品・親から渡す値（Props）・変わる状態（State）を使います。コード実習にはPCでDockerを使って学習版を起動する必要があります。';

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${testBasePath()}#/`);
    const card = page.getByRole('article', { name: title, exact: true });
    const homeGuide = card.getByText(before, { exact: true });
    await homeGuide.scrollIntoViewIfNeeded();
    await expect(homeGuide).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);

    await page.goto(`${testBasePath()}#/courses/next`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const mapGuide = page.getByText(before, { exact: true });
    await mapGuide.scrollIntoViewIfNeeded();
    await expect(mapGuide).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
});
