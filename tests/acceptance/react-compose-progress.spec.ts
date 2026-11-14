import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { readStoredProgress, waitForDraftSaved } from '../e2e/helpers/progress';
import { testServerUrl } from '../e2e/helpers/testBasePath';
import { expectStoredViewedSlide } from '../e2e/helpers/releaseCourse';

for (const suffix of ['06', '11']) {
  const lesson = `react-ch01-l${suffix}-compose`;
  const exercise = `${lesson}-e01`;
  const root = `content/react/chapters/react-ch01/lessons/${lesson}/exercises/${exercise}`;
  test(`${lesson}の未実装診断から本人の編集・判定・保存・再表示へ進める`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const slide = `${lesson}-s01`;
    await page.goto(`${testServerUrl()}#/courses/react/lessons/${lesson}/slides/${slide}`);
    await expectStoredViewedSlide(page, lesson, slide);
    const route = `${testServerUrl()}#/courses/react/lessons/${lesson}/exercises/${exercise}`;
    await page.goto(route);
    await expect(page.getByText(/処理は未実装/u).first()).toBeVisible();
    const instructions = page.getByRole('region', { name: '演習の手順', exact: true });
    if (suffix === '06') {
      await expect(instructions).toContainText('attemptedはfalse');
      await expect(instructions).toContainText('名前を入力してください');
      await expect(instructions).toContainText('aria-invalid');
    } else {
      await expect(instructions).toContainText('空文字列で始まるState');
      await expect(instructions).toContainText('[target]');
      await expect(instructions).toContainText('cleanup');
    }
    await instructions.getByRole('button', { name: /^手順 2：/u }).click();
    await expect(instructions).toContainText(suffix === '06' ? 'currentTarget.value' : '購読中0');
    await instructions.getByRole('button', { name: /^手順 1：/u }).click();
    await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
    await expect(
      page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
    ).toBeVisible();
    const source = await readFile(`${root}/solution/components.tsx`, 'utf8');
    await page.getByRole('tab', { name: 'components.tsx', exact: true }).click();
    const editor = page.getByRole('textbox', {
      name: 'components.tsx のコードエディター',
      exact: true,
    });
    await editor.focus();
    await editor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.insertText(source);
    await expect
      .poll(
        async () =>
          (await readStoredProgress(page)).drafts.find((row) => row['workspaceId'] === exercise)?.[
            'files'
          ],
      )
      .toMatchObject({ 'components.tsx': source });
    await waitForDraftSaved(page);
    if (suffix === '06') {
      const preview = page.frameLocator('iframe[title="Reactコードのプレビュー"]');
      const input = preview.getByRole('textbox', { name: '名前', exact: true });
      await expect(input).toHaveAttribute('aria-invalid', 'false');
      await input.fill('   ');
      await input.press('Enter');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(preview.getByRole('status')).toHaveText('名前を入力してください');
      await input.fill('  みお  ');
      await expect(input).toHaveAttribute('aria-invalid', 'false');
      await input.press('Enter');
      await expect(preview.getByRole('status')).toHaveText('送信を受け付けました');
      await preview.getByRole('button', { name: 'やり直し', exact: true }).click();
      await expect(input).toHaveValue('');
      await expect(input).toHaveAttribute('aria-invalid', 'false');
      await expect(preview.getByRole('status')).toHaveText('入力中');
    }
    await page.screenshot({ path: info.outputPath(`${lesson}-preview.png`), fullPage: true });
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(page.getByTestId('learning-completion')).toBeVisible({ timeout: 60_000 });
    const before = (await readStoredProgress(page)).drafts.find(
      (row) => row['workspaceId'] === exercise,
    );
    expect(Object.keys(before?.['lastPassingSnapshots'] as object)).toContain(exercise);
    await page.reload();
    await expect(page.getByTestId('learning-completion')).toBeVisible();
    // 完成画面の再読込後、保存済みの演習URLを開き直す。
    await page.goto(route);
    await expect(page.getByRole('tab', { name: 'components.tsx', exact: true })).toBeVisible();
    const after = (await readStoredProgress(page)).drafts.find(
      (row) => row['workspaceId'] === exercise,
    );
    expect(after?.['files']).toEqual(before?.['files']);
    expect(after?.['lastPassingSnapshots']).toEqual(before?.['lastPassingSnapshots']);
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(page.getByTestId('learning-completion')).toBeVisible({ timeout: 60_000 });
  });
}
