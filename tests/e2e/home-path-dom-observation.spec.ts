import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { parse } from 'yaml';
import { testBasePath } from './helpers/testBasePath';

test('Python Path role color and affected rectangle', async ({ page }) => {
  const path: unknown = parse(await readFile('content/learning-paths/python-basics.yaml', 'utf8'));
  expect(path).toMatchObject({
    id: 'python-basics',
    publicationStatus: 'published',
    steps: [
      { courseId: 'python-basics', role: 'required' },
      { courseId: 'python-practice', role: 'recommended' },
      { courseId: 'python-oop', role: 'recommended' },
    ],
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(testBasePath());
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'HTML/CSS はじめの一歩の進捗' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'この端末の学習データ' })).toBeVisible();
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
  await expect
    .poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })))
    .toEqual({ x: 0, y: 0 });

  const card = page.getByRole('article', { name: 'Python基礎と実践の学習パス', exact: true });
  await expect(card).toBeVisible();
  const bar = card.locator('div[aria-hidden="true"]').first();
  const segments = bar.locator(':scope > span');
  await expect(segments).toHaveCount(3);
  const colors = await segments.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).backgroundColor),
  );
  expect(colors).toEqual(['rgb(0, 105, 92)', 'rgb(242, 201, 76)', 'rgb(242, 201, 76)']);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('Path bar geometry unavailable');
  expect(box.x).toBeLessThanOrEqual(853);
  expect(box.y).toBeLessThanOrEqual(697);
  expect(box.x + box.width).toBeGreaterThanOrEqual(1260);
  expect(box.y + box.height).toBeGreaterThanOrEqual(705);
  console.info('Home Path Source roles, DOM colors, and observed diff rectangle: matched');
});
