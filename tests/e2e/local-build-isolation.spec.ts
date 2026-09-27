import { expect, test } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';

test('Pages Homeは起動手順だけを案内しLocal APIを探索しない', async ({ page }, info) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto(testBasePath());
  const guide = page.getByRole('link', { name: '起動手順を見る', exact: true });
  await expect(guide).toHaveAttribute(
    'href',
    'https://github.com/santa928/tsumucode#ローカルnodejs学習',
  );
  await expect(page.getByRole('link', { name: 'ClosureをNode.jsで実行する' })).toHaveCount(0);
  await guide.scrollIntoViewIfNeeded();
  await expect(guide).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: info.outputPath('pages-local-guide.png') });
  expect(apiRequests).toEqual([]);
});
