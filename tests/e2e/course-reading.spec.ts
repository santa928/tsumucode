import { expect, test } from '@playwright/test';
import { readStoredProgress } from './helpers/progress';

const COURSE = './#/courses/tailwind';
const LESSON = 'tailwind-ch01-l02';
const LAST_SLIDE = `${LESSON}-s03`;

test.use({ viewport: { width: 390, height: 844 } });

test('狭幅のCourse目次は文字200%でも操作ラベルを切らない', async ({ page }, info) => {
  await page.goto(COURSE);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tailwind CSSと見た目の基本' }),
  ).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const links = page.locator('[data-lesson-piece] a');
  await expect(links).toHaveCount(5);
  await links.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('course-map-text200.png') });
  const clipped = await links.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const bounds = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const outside = [...range.getClientRects()].some(
        (rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1,
      );
      return outside
        ? [{ label: element.textContent, width: bounds.width, height: bounds.height }]
        : [];
    }),
  );
  expect(clipped).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('狭幅で全Slideを読んだLessonはCourse再訪後も解説へ戻る', async ({ page }, info) => {
  await page.goto(`${COURSE}/lessons/${LESSON}/slides/${LESSON}-s01`);
  for (const title of ['文字の大きさと行の高さを分ける', '背景色と文字色を対で考える']) {
    await page.getByRole('link', { name: '次のスライドへ →', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  // 通常UIによる閲覧保存の完了を読み取り、保存前の遷移と取り違えない。
  await expect
    .poll(async () => {
      const stored = await readStoredProgress(page);
      const progress = stored.courses.find((entry) => entry['courseId'] === 'tailwind');
      const lessons = progress?.['lessons'] as
        Record<string, { currentSlideId?: string }> | undefined;
      return lessons?.[LESSON]?.currentSlideId;
    })
    .toBe(LAST_SLIDE);
  await page
    .getByRole('navigation', { name: 'スライド移動' })
    .getByRole('link', { name: 'コースマップへ戻る', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tailwind CSSと見た目の基本' }),
  ).toBeVisible();
  await page.reload();
  const lesson = page.locator('[data-lesson-piece]').filter({
    has: page.getByRole('heading', { name: '幅・余白・文字・色を組み合わせる', exact: true }),
  });
  await lesson.getByRole('link').click();
  await page.screenshot({ path: info.outputPath('reading-revisit.png') });
  await expect(page).toHaveURL(new RegExp(`/slides/${LAST_SLIDE}$`, 'u'));
  await expect(
    page.getByRole('heading', { name: '背景色と文字色を対で考える', exact: true }),
  ).toBeVisible();
});
