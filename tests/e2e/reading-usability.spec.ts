import { expect, test } from '@playwright/test';
import { readStoredProgress, seedCompletedProgress } from './helpers/progress';

const lesson = 'javascript-ch00-l01';
const slidePath = (scope: 'courses' | 'library', slide: string) =>
  `./#/${scope}/javascript/lessons/${lesson}/slides/${lesson}-${slide}`;

test('説明が指す文字列を横スクロールなしで読め、コードの文字列と改行を保つ', async ({ page }) => {
  for (const [width, scale] of [
    [1280, 100],
    [1280, 200],
    [390, 100],
    [390, 200],
  ] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(slidePath('courses', 's04'));
    await expect(page.getByTestId('slide-stage')).toBeVisible();
    await page.evaluate((value) => {
      document.documentElement.style.fontSize = `${value}%`;
    }, scale);
    const code = page.locator('.tc-slide-code[data-code-role="input"] pre');
    expect(await code.textContent()).toBe(
      "document.querySelector('#message').textContent = 'こんにちは';",
    );
    const bounds = await code.evaluate((pre) => {
      const target = [...pre.querySelectorAll('span')].find(
        (span) => span.textContent === "'こんにちは'",
      );
      if (!target) throw new Error('注目文字列がありません');
      const box = pre.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        scrollLeft: pre.scrollLeft,
        target: [...target.getClientRects()].map((rect) => ({
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        })),
      };
    });
    expect(bounds.scrollLeft).toBe(0);
    expect(bounds.target.length).toBeGreaterThan(0);
    for (const rect of bounds.target) {
      expect(rect.left).toBeGreaterThanOrEqual(bounds.left);
      expect(rect.right).toBeLessThanOrEqual(bounds.right);
      expect(rect.top).toBeGreaterThanOrEqual(bounds.top);
      expect(rect.bottom).toBeLessThanOrEqual(bounds.bottom);
    }
    await code.focus();
    await code.press('ArrowRight');
    await expect(page).toHaveURL(/javascript-ch00-l01-s04$/u);
    const end = page.getByTestId('slide-stage').locator('.tc-slide-blocks > *').last();
    await end.scrollIntoViewIfNeeded();
    await expect(end).toBeInViewport();
  }
});

test('モバイルでは引継ぎ案内を展開せず本文から前後へ進み、必要時にURLを使える', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await seedCompletedProgress(page);
  const before = await readStoredProgress(page);
  for (const scale of [100, 200]) {
    await page.goto(slidePath('library', 's02'));
    await expect(page.getByTestId('slide-stage')).toBeVisible();
    await page.evaluate((value) => {
      document.documentElement.style.fontSize = `${value}%`;
    }, scale);
    const disclosure = page.getByText('読書位置のURL・PCへの引き継ぎ', { exact: true });
    const controls = page.getByRole('complementary', { name: '読書の続きとPCへの引き継ぎ' });
    await expect(controls.getByLabel('読書位置のURL', { exact: true })).not.toBeVisible();
    const gap = await page.evaluate(() => {
      const card = document.querySelector('[data-slide-card]')!.getBoundingClientRect();
      const pager = document.querySelector('.tc-slide-pager')!.getBoundingClientRect();
      return pager.top - card.bottom;
    });
    expect(gap).toBeLessThan(844);
    const next = page.getByRole('link', { name: '次のスライドへ', exact: true });
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeInViewport();
    await next.tap();
    await expect(page).toHaveURL(/javascript-ch00-l01-s03$/u);
    await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', `${lesson}-s03`);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await page.getByRole('link', { name: '前のスライドへ' }).tap();
    await expect(page).toHaveURL(/javascript-ch00-l01-s02$/u);
    await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', `${lesson}-s02`);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await disclosure.focus();
    await disclosure.press('Enter');
    await expect(controls.getByLabel('読書位置のURL', { exact: true })).toBeVisible();
    await expect(controls.getByRole('textbox', { name: '読書位置のURL', exact: true })).toHaveValue(
      /javascript-ch00-l01-s02$/u,
    );
    await expect(controls.getByText(/端末間で自動同期されません/u)).toBeVisible();
    await controls.getByRole('button', { name: '読書位置のURLをコピー', exact: true }).tap();
    await expect(controls.getByText('URLを選択してコピーしてください')).toBeVisible();
    const readingUrl = controls.getByRole('textbox', { name: '読書位置のURL', exact: true });
    await readingUrl.focus();
    expect(
      await readingUrl.evaluate((input) => {
        if (!(input instanceof HTMLInputElement)) throw new Error('URL入力欄がありません');
        return (input.selectionEnd ?? 0) - (input.selectionStart ?? 0);
      }),
    ).toBeGreaterThan(0);
    const exerciseLink = controls.getByRole('link', { name: /^PC向け演習を開く/u });
    await exerciseLink.scrollIntoViewIfNeeded();
    await expect(exerciseLink).toBeInViewport();
    await disclosure.focus();
    await disclosure.press('Enter');
    await expect(controls.getByLabel('読書位置のURL', { exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'スライド目次を開く' }).tap();
    await expect(page.getByRole('dialog', { name: 'スライド目次' })).toBeVisible();
    await page.getByRole('button', { name: '閉じる', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'スライド目次を開く' })).toBeFocused();
    await page.reload();
    await expect(page.getByTestId('slide-stage')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const saved = JSON.parse(localStorage.getItem('tsumucode-reading-v1') ?? '{}') as {
            positions?: { courseId: string; slideId: string }[];
          };
          return saved.positions?.find((item) => item.courseId === 'javascript')?.slideId;
        }),
      )
      .toBe(`${lesson}-s02`);
    await page.goto('./#/library/javascript');
    await page.getByRole('link', { name: /：読書の続きから$/u }).tap();
    await expect(page).toHaveURL(/javascript-ch00-l01-s02$/u);
  }
  expect(await readStoredProgress(page)).toEqual(before);
  await context.close();
});
