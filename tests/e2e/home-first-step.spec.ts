import { expect, test } from '@playwright/test';
import { READING_PILOT_LESSONS } from '../../src/features/library/readingTargets';

for (const width of [1280, 390]) {
  for (const enlarged of [false, true]) {
    test(`Homeの今回の学習から読む・自由選択へ進める ${String(width)} 文字${enlarged ? '200' : '100'}%`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('./#/');
      const section = page.getByRole('region', { name: '今回の学習' });
      await expect(section.getByRole('heading', { name: '最初の小さな制作' })).toBeVisible();
      if (enlarged) {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
      }
      const primary = section.getByRole('link', {
        name: width < 1024 ? '解説を読む' : '見出しと背景色を変えてみる',
        exact: true,
      });
      await expect(primary).toBeVisible();
      if (!enlarged) await expect(primary).toBeInViewport();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: enlarged });
      await primary.scrollIntoViewIfNeeded();
      await expect(page.getByRole('link', { name: '本文へ移動' })).not.toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('first-step.png') });

      // Hash routeを変えず、教材棚をKeyboardの続き位置にする。
      await section.getByRole('button', { name: 'ほかの教材を選ぶ' }).press('Enter');
      await expect(page).toHaveURL(/#\/$/u);
      await expect(page.getByRole('heading', { name: '個別コースを選ぶ' })).toBeFocused();
      await expect(page.getByRole('button', { name: '全コースの進捗を書き出す' })).toBeAttached();

      const reading = section.getByRole('link', {
        name: width < 1024 ? '解説を読む' : '解説だけ読む',
        exact: true,
      });
      await reading.click();
      await expect(page).toHaveURL(/#\/library\/html-css$/u);
      await expect(
        page.getByRole('heading', { name: 'HTML/CSS はじめの一歩 スライド目次' }),
      ).toBeVisible();
      await expect(page.locator('.cm-editor')).toHaveCount(0);
      if (width === 390 && !enlarged) {
        await page.goto('./#/');
        await page.getByRole('link', { name: '制作途中のレッスンを試す' }).click();
        await expect(page).toHaveURL(/#\/library\/pilot$/u);
        await expect(
          page.getByRole('heading', { level: 1, name: '試用レッスンの目次' }),
        ).toBeVisible();
        // 教材追加ごとの件数複製を避け、明示した試用対象への全リンクを照合する。
        const expectedTargets = READING_PILOT_LESSONS.map(
          ({ courseId, lessonId }) => `#/library/pilot/${courseId}/lessons/${lessonId}/read`,
        );
        await expect
          .poll(() =>
            page
              .getByRole('link', { name: /^一続きに読む/u })
              .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
          )
          .toEqual(expectedTargets);
      }
    });
  }
}
