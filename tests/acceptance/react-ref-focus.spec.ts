import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { readStoredProgress, waitForDraftSaved } from '../e2e/helpers/progress';
import { testServerUrl } from '../e2e/helpers/testBasePath';

test('Refの実クリックによるfocusと通常UIの採点を比較する', async ({ page }, info) => {
  const id = 'react-ch01-l10-e01';
  await page.goto(`${testServerUrl()}#/courses/react/lessons/react-ch01-l10/exercises/${id}`);
  await page.getByRole('tab', { name: 'components.tsx', exact: true }).click();
  const source = await readFile(
    `content/react/chapters/react-ch01/lessons/react-ch01-l10/exercises/${id}/solution/components.tsx`,
    'utf8',
  );
  const editor = page.getByRole('textbox', {
    name: 'components.tsx のコードエディター',
    exact: true,
  });
  await editor.focus();
  await editor.press('Control+A');
  await page.keyboard.insertText(source);
  await waitForDraftSaved(page);
  await page.evaluate(() => {
    performance.clearMeasures('tsumucode:preview-update');
  });
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect
    .poll(
      () => page.evaluate(() => performance.getEntriesByName('tsumucode:preview-update').length),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
  const frame = page.frameLocator('iframe[title="Reactコードのプレビュー"]');
  const input = frame.getByRole('textbox', { name: '名前', exact: true });
  await frame.getByRole('button', { name: '入力へ移る', exact: true }).click();
  await expect(input).toBeFocused();
  await input.fill('Ada');
  await expect(frame.locator('#name-summary')).toHaveText('Ada');
  await page.screenshot({ path: info.outputPath('ref-actual-click.png'), fullPage: true });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '判定結果', exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(async () => {
      const stored = await readStoredProgress(page);
      const draft = stored.drafts.find((draft) => draft['exerciseId'] === id);
      return (draft?.['validationHistory'] as unknown[] | undefined)?.length ?? 0;
    })
    .toBeGreaterThan(0);
  const stored = await readStoredProgress(page);
  await writeFile(info.outputPath('ref-ui-observation.json'), JSON.stringify(stored, null, 2));
  const draft = stored.drafts.find((draft) => draft['exerciseId'] === id);
  const history = draft?.['validationHistory'] as
    { status: string; diagnostics: unknown[]; checks: { passed: boolean }[] }[] | undefined;
  const result = history?.at(-1);
  expect(result?.status).toBe('pass');
  expect(result?.diagnostics).toEqual([]);
  expect(result?.checks.every(({ passed }) => passed)).toBe(true);
});
