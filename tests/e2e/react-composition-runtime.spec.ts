import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readStoredProgress, waitForStoredDraftContent } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';
import { expectStoredViewedSlide } from './helpers/releaseCourse';

/** 画面外の行も含め、CodeMirrorの通常の全文コピーから編集Sourceを読む。 */
async function copyEditorSource(page: Page): Promise<string> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  return page.evaluate(() => navigator.clipboard.readText());
}

/** キーボードで全文を置換し、保存とコピーの両方で欠落のないSourceを確認する。 */
async function replaceSource(page: Page, source: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(source);
  await waitForStoredDraftContent(page, source);
  await expect.poll(() => copyEditorSource(page)).toBe(source);
}

for (const lesson of ['react-ch01-l02', 'react-ch01-l03']) {
  const exercise = `${lesson}-e01`;
  const root = `content/react/chapters/react-ch01/lessons/${lesson}/exercises/${exercise}`;
  const route = `${testBasePath()}#/courses/react/lessons/${lesson}/exercises/${exercise}`;
  test(`${lesson}のProps・children修正を描画・判定・保存・ResetとKeyboard Hintへ接続する`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    for (let index = 1; index <= 3; index += 1) {
      const slide = `${lesson}-s0${String(index)}`;
      await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${slide}`);
      await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide);
      await expectStoredViewedSlide(page, lesson, slide);
    }
    await page.goto(route);
    const starter = await readFile(`${root}/starter/components.tsx`, 'utf8');
    await expect.poll(() => copyEditorSource(page)).toBe(starter);
    const trigger = page.getByRole('button', { name: 'ヒントを見る', exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    const hint = page
      .getByRole('dialog', { name: 'ヒント', exact: true })
      .getByRole('button', { name: /^ヒント1を見る/u });
    await hint.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'ヒント', exact: true })).toContainText(
      lesson.endsWith('02') ? 'TopicCardを呼ぶ2か所' : 'LearningPanelの開始タグと終了タグ',
    );
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    const solution = await readFile(`${root}/solution/components.tsx`, 'utf8');
    await replaceSource(page, solution);
    const update = page.getByRole('button', { name: 'プレビューを更新', exact: true });
    await expect(update).toBeEnabled();
    await update.focus();
    await expect(update).toBeFocused();
    await page.keyboard.press('Enter');
    const preview = page.frameLocator('iframe[title="Reactコードのプレビュー"]');
    await expect(preview.getByRole('heading', { name: '学習テーマ', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(preview.locator('h2')).toHaveText(['HTML', 'CSS']);
    await expect(preview.locator('p')).toHaveText(['内容を組み立てる', '見た目を整える']);
    if (lesson.endsWith('03')) await expect(preview.locator('section section h2')).toHaveCount(2);
    await page.screenshot({ path: info.outputPath(`${lesson}-real-dom.png`), fullPage: true });
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'ピースがはまりました', exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    const before = await readStoredProgress(page);
    expect((before.drafts[0]?.validationHistory as { status: string }[]).at(-1)?.status).toBe(
      'pass',
    );
    expect((await new AxeBuilder({ page }).exclude('iframe').analyze()).violations).toEqual([]);
    await page.goto(route);
    await expect.poll(() => copyEditorSource(page)).toBe(solution);
    await page.reload();
    await expect.poll(() => copyEditorSource(page)).toBe(solution);
    expect((await readStoredProgress(page)).drafts[0]?.files).toEqual(before.drafts[0]?.files);
    await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
    await page
      .getByRole('dialog', { name: '最初のコードに戻しますか？' })
      .getByRole('button', { name: '最初のコードに戻す', exact: true })
      .click();
    await expect.poll(() => copyEditorSource(page)).toBe(starter);
    await waitForStoredDraftContent(page, starter);
  });
}

test('390pxで再利用・Compositionの6SlideとPC案内を読める', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lesson of ['react-ch01-l02', 'react-ch01-l03']) {
    for (let index = 1; index <= 3; index += 1) {
      const slide = `${lesson}-s0${String(index)}`;
      await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${slide}`);
      await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide);
      await expectStoredViewedSlide(page, lesson, slide);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );
      await page.screenshot({ path: info.outputPath(`${slide}-mobile.png`), fullPage: true });
    }
  }
  await page.goto(
    `${testBasePath()}#/courses/react/lessons/react-ch01-l03/exercises/react-ch01-l03-e01`,
  );
  await expect(page.getByRole('heading', { name: 'PCで演習を開く', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath('composition-mobile-pc-notice.png'),
    fullPage: true,
  });
});
