import { expect, test, type Page } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';
import { observeNextGuide, startNextGuideObservation } from './helpers/observeNextGuide';

const title = 'Next.js 実サーバーの第一歩';
const before =
  'TypeScriptの型と、Reactの部品・親から渡す値（Props）・変わる状態（State）を使います。コード実習にはPCでDockerを使って学習版を起動する必要があります。';

/** Course Map and Home use the same title and guide, so require Home's region. */
function nextHomeGuide(page: Page) {
  return page
    .getByRole('region', { name: '学びたいピースを選ぶ', exact: true })
    .getByRole('article', { name: title, exact: true })
    .getByText(before, { exact: true });
}

test('Homeの説明は遷移前の同名Course Mapに一致しない', async ({ page }) => {
  await page.setContent(
    `<article data-course-map aria-labelledby="course-map-title"><h1 id="course-map-title">${title}</h1><dd>${before}</dd></article>`,
  );
  await expect(
    page.getByRole('article', { name: title, exact: true }).getByText(before, { exact: true }),
  ).toHaveCount(1);
  await expect(nextHomeGuide(page)).toHaveCount(0);

  await page.setContent(
    `<section aria-labelledby="catalog-title"><h1 id="catalog-title">学びたいピースを選ぶ</h1><article aria-labelledby="course-title-next"><h3 id="course-title-next">${title}</h3><dd>${before}</dd></article></section>`,
  );
  await expect(nextHomeGuide(page)).toBeVisible();
});

test('Nextの入口に必要な前提と実習環境を表示する', async ({ page }) => {
  if (process.env['TSUMUCODE_NEXT_DOM_DIAGNOSTICS'] === '1') {
    const allowed = new Set(
      [
        'scope-start',
        'scope-stop',
        'card-seen',
        'guide-seen',
        'card-detached',
        'guide-detached',
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
    const homeGuide = nextHomeGuide(page);
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
