import { expect, test } from '@playwright/test';
import { exerciseRoute, STANDARD_EXERCISE_ID, STANDARD_LESSON_ID } from './helpers/releaseCourse';

test('Exercise初回表示は手動更新なしでPreviewを描画する', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID));

  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="コードのプレビュー"]').getByRole('heading', {
      name: 'ここを書き換えます',
    }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/プレビューを更新できませんでした/u)).toHaveCount(0);
});
