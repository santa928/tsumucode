import { expect, test } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';
import { observeNextGuide, startNextGuideObservation } from './helpers/observeNextGuide';

test('Nextの入口に必要な前提と実習環境を表示する', async ({ page }) => {
  const title = 'Next.js 実サーバーの第一歩';
  const before =
    'TypeScriptの型と、Reactの部品・親から渡す値（Props）・変わる状態（State）を使います。コード実習にはPCでDockerを使って学習版を起動する必要があります。';

  if (process.env['TSUMUCODE_NEXT_DOM_DIAGNOSTICS'] === '1') {
    const allowed = new Set(
      [
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
      ].flatMap((category) =>
        ['desktop', 'mobile', 'unknown'].flatMap((width) =>
          ['home', 'other'].map(
            (route) => `[next-guide-observation] ${category} ${width} ${route}`,
          ),
        ),
      ),
    );
    page.on('console', (message) => {
      if (allowed.has(message.text())) console.info(message.text());
    });
    await startNextGuideObservation(() => page.addInitScript(observeNextGuide, before));
  }

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${testBasePath()}#/`);
    const card = page.getByRole('article', { name: title, exact: true });
    const homeGuide = card.getByText(before, { exact: true });
    if (process.env['TSUMUCODE_NEXT_DOM_DIAGNOSTICS'] === '1') {
      console.info(
        viewport.width === 1280
          ? '[next-guide-observation] desktop-home-scroll'
          : '[next-guide-observation] mobile-home-scroll',
      );
    }
    if (process.env['TSUMUCODE_NEXT_DOM_DIAGNOSTICS'] === '1') {
      await startNextGuideObservation(() =>
        page.evaluate(() => window.dispatchEvent(new Event('tsumucode-next-observe-start'))),
      );
    }
    try {
      await homeGuide.scrollIntoViewIfNeeded();
    } finally {
      if (process.env['TSUMUCODE_NEXT_DOM_DIAGNOSTICS'] === '1') {
        await page
          .evaluate(() => window.dispatchEvent(new Event('tsumucode-next-observe-stop')))
          .catch(() => {});
      }
    }
    if (process.env['TSUMUCODE_NEXT_DOM_DIAGNOSTICS'] === '1') {
      console.info('[next-guide-observation] home-scroll-complete');
    }
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
