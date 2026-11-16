import { expect, test } from '@playwright/test';
import { observeNextGuide, startNextGuideObservation } from './helpers/observeNextGuide';
import { testBasePath } from './helpers/testBasePath';

// Diagnostic prefix ends at mobile Home; the complete existing spec remains separate.
// Text absence is not proof that progress loaded successfully or that the router is idle.
const title = 'Next.js 実サーバーの第一歩';
const before =
  'TypeScriptの型と、Reactの部品・親から渡す値（Props）・変わる状態（State）を使います。コード実習にはPCでDockerを使って学習版を起動する必要があります。';
const categories = [
  'scope-start',
  'scope-stop',
  'card-seen',
  'guide-seen',
  'card-detached',
  'guide-detached',
  'card-removed',
  'guide-removed',
  'other-node-removed',
  'removal-budget-exhausted',
  'hashchange',
  'pagehide',
  'node-budget-exhausted',
  'observation-budget-exhausted',
] as const;
const allowed = new Set(
  categories.flatMap((category) =>
    ['desktop', 'mobile', 'unknown'].flatMap((width) =>
      ['home', 'other'].map((route) => `[next-guide-observation] ${category} ${width} ${route}`),
    ),
  ),
);

for (let iteration = 1; iteration <= 3; iteration += 1) {
  for (const variant of ['original', 'visible-loading-text-absent'] as const) {
    test(`Next same-page navigation ${iteration} ${variant}`, async ({ page }) => {
      const events: string[] = [];
      page.on('console', (message) => {
        if (allowed.has(message.text()) || message.text() === '[next-control] hashchange home') {
          events.push(message.text());
        }
      });
      await page.addInitScript(() => {
        window.addEventListener('hashchange', () => {
          if (location.hash === '#/') console.info('[next-control] hashchange home');
        });
      });
      await startNextGuideObservation(() => page.addInitScript(observeNextGuide, before));
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${testBasePath()}#/`);
      const desktopCard = page.getByRole('article', { name: title, exact: true });
      const desktopGuide = desktopCard.getByText(before, { exact: true });
      await desktopGuide.scrollIntoViewIfNeeded();
      await expect(desktopGuide).toBeVisible();
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

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${testBasePath()}#/`);
      const card = page.getByRole('article', { name: title, exact: true });
      const guide = card.getByText(before, { exact: true });
      await startNextGuideObservation(() =>
        page.evaluate(() => window.dispatchEvent(new Event('tsumucode-next-observe-start'))),
      );
      const started = performance.now();
      try {
        if (variant === 'visible-loading-text-absent') {
          await expect(card).toBeVisible();
          await expect(
            card.getByText('この端末の続き位置を確認しています。', { exact: true }),
          ).toHaveCount(0);
        }
        await guide.scrollIntoViewIfNeeded();
        await expect(guide).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
      } finally {
        await page
          .evaluate(() => window.dispatchEvent(new Event('tsumucode-next-observe-stop')))
          .catch(() => {});
        console.info(
          `[next-control] ${variant} ${iteration} elapsed-ms ${Math.round(performance.now() - started)}`,
        );
        for (const event of events) console.info(event);
      }
      expect(events).toContain('[next-guide-observation] scope-start mobile home');
    });
  }
}
