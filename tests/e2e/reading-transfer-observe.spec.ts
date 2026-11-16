import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`読書と演習データの引き継ぎ案内を確認できる (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('./#/library/javascript/lessons/javascript-ch00-l01/slides/javascript-ch00-l01-s02');
    await expect(page.getByTestId('slide-stage')).toBeVisible();
    const controls = page.getByRole('complementary', { name: '読書の続きとPCへの引き継ぎ' });
    await controls.getByText('読書位置のURL・PCへの引き継ぎ', { exact: true }).click();
    await expect(controls.getByText(/演習の進捗と下書きはJSONの書き出し・読み込みで引き継げます。/u)).toBeVisible();
    await expect(controls.getByText(/読書の続き位置と「あとで試す印」はJSONに含まれません。/u)).toBeVisible();
    await expect(controls.getByRole('textbox', { name: '読書位置のURL', exact: true })).toHaveValue(
      /javascript-ch00-l01-s02$/u,
    );
  });
}
