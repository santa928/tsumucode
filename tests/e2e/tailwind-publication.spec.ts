import { expect, test } from '@playwright/test';
import { replaceEditorText } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

const base = testBasePath();
const title = 'Tailwind CSSと見た目の基本';

test('Tailwindを選択として公開し、未開始と未完了のどちらでもJavaScriptへ進める', async ({
  page,
}, info) => {
  const compilerRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/tailwind-runtime/')) compilerRequests.push(request.url());
  });
  await page.goto(base + '#/');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(
    page.getByRole('link', { name: title + '：最初のピースを置く', exact: true }),
  ).toBeVisible();
  await page.goto(base + '#/paths/frontend');
  const steps = page.locator('[data-learning-path-step]');
  await expect(steps).toHaveCount(6);
  const tailwind = steps.filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(steps.nth(1)).toContainText(title);
  await expect(tailwind.locator('[data-path-role-badge]')).toHaveText('選択');
  await expect(tailwind.getByRole('link', { name: title + 'を始める', exact: true })).toBeVisible();
  expect(compilerRequests).toEqual([]);
  const javascript = () =>
    page.getByRole('link', {
      name: /^JavaScript はじめの一歩(?:を始める|のつづきから)$/,
    });
  await javascript().click();
  await expect(page).toHaveURL(/#\/courses\/javascript(?:\/|$)/);

  await page.goto(base + '#/paths/frontend');
  await tailwind.getByRole('link', { name: title + 'を始める', exact: true }).click();
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('link', { name: '次のスライドへ →', exact: true }).click();
  }
  await page.getByRole('link', { name: /のコード演習を始める$/ }).click();
  const grade = page.getByRole('button', { name: '判定する', exact: true });
  await expect(grade).toBeEnabled();
  const starter = await page.locator('.cm-content').innerText();
  await replaceEditorText(page, starter.replace('p-2', 'p-4'));
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
  await grade.click();
  await expect(page.getByRole('dialog')).toContainText('あと一歩');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.goto(base + '#/paths/frontend');
  await expect(tailwind.getByRole('progressbar')).toHaveAttribute('value', '0');
  await expect(
    tailwind.getByRole('link', { name: title + 'のつづきから', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('tailwind-optional-path.png'), fullPage: true });
  await javascript().click();
  await expect(page).toHaveURL(/#\/courses\/javascript(?:\/|$)/);
});
